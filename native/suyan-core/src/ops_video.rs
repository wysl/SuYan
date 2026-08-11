//! 阶段 4 业务方法：视频压缩。
//!
//! `video.compressFile`：spawn ffmpeg 子进程，解析 stderr 进度，支持超时与取消。
//! 与 Node 侧 `videoCompressor.runFfmpeg + parseProgressFraction` 的行为对齐：
//! - 进度通过 NDJSON 事件 `{"event":"video.progress","data":{"fraction":0.5}}` 上报；
//! - 取消通过 `video.cancel` 设置全局标志，正在运行的 ffmpeg 任务轮询后 kill 子进程；
//! - 超时（默认 10 分钟）后 kill 子进程并返回 `VIDEO_TIMEOUT`。
//!
//! ffmpeg 输出写入临时文件仍由 Node 侧负责；Rust 只负责调度子进程与进度上报。

use std::io::{self, BufReader, Read, Write};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::ErrorBody;

/// 全局取消标志。`video.compressFile` 开始时复位，`video.cancel` 置位。
static VIDEO_CANCEL: AtomicBool = AtomicBool::new(false);
/// 全局退出标志。`system.shutdown` 时置位，让运行中的 ffmpeg 任务尽快结束。
static VIDEO_SHUTDOWN: AtomicBool = AtomicBool::new(false);

/// `video.cancel`：设置取消标志，正在运行的 ffmpeg 任务会尽快结束。
pub fn handle_cancel_video() -> Result<Value, ErrorBody> {
    VIDEO_CANCEL.store(true, Ordering::SeqCst);
    Ok(json!({ "status": "canceled" }))
}

/// `system.shutdown` 时调用：设置退出标志，让运行中的 ffmpeg 任务结束。
pub fn request_shutdown() {
    VIDEO_SHUTDOWN.store(true, Ordering::SeqCst);
}

/// `video.compressFile`：执行一次 ffmpeg 压缩。
/// 参数：`{ ffmpegPath, args, timeoutMs?, duration? }`。
/// 返回：`{ code, stderr }`。`code` 为 ffmpeg 退出码（0 表示成功）。
pub fn run_ffmpeg(params: &Value, stdout: &Arc<Mutex<io::Stdout>>) -> Result<Value, ErrorBody> {
    let ffmpeg_path = required_string(params, "ffmpegPath")?;
    let args = required_string_array(params, "args")?;
    let timeout_ms = params
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(600_000);
    let duration = params.get("duration").and_then(Value::as_f64).unwrap_or(0.0);

    VIDEO_CANCEL.store(false, Ordering::SeqCst);

    let mut child = std::process::Command::new(&ffmpeg_path)
        .args(&args)
        // ffmpeg 默认从 stdin 读交互命令；必须置 null，否则会阻塞等待输入。
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| ErrorBody {
            code: "VIDEO_FFMPEG_SPAWN_FAILED".to_owned(),
            message: format!("无法启动 ffmpeg {}: {}", ffmpeg_path, error),
        })?;

    let stderr_pipe = child.stderr.take().ok_or_else(|| ErrorBody {
        code: "VIDEO_FFMPEG_STDERR_FAILED".to_owned(),
        message: "无法读取 ffmpeg 错误输出".to_owned(),
    })?;

    // 后台线程：逐行读取 ffmpeg 的 stderr，收集完整文本并解析进度事件。
    let stdout_task = Arc::clone(stdout);
    let stderr_handle = std::thread::spawn(move || collect_stderr(stderr_pipe, &stdout_task, duration));

    // 主线程：轮询子进程状态，同时响应取消与超时。
    let start = Instant::now();
    let status = loop {
        if VIDEO_CANCEL.load(Ordering::SeqCst) || VIDEO_SHUTDOWN.load(Ordering::SeqCst) {
            let _ = child.kill();
            return Err(ErrorBody {
                code: "VIDEO_CANCELED".to_owned(),
                message: "已取消视频压缩".to_owned(),
            });
        }
        if start.elapsed() > Duration::from_millis(timeout_ms) {
            let _ = child.kill();
            return Err(ErrorBody {
                code: "VIDEO_TIMEOUT".to_owned(),
                message: "ffmpeg 执行超时".to_owned(),
            });
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                return Err(ErrorBody {
                    code: "VIDEO_WAIT_FAILED".to_owned(),
                    message: format!("等待 ffmpeg 失败: {}", error),
                });
            }
        }
    };

    let stderr_text = stderr_handle.join().unwrap_or_default();
    let code = status.code().unwrap_or(-1);

    Ok(json!({
        "code": code,
        "stderr": stderr_text,
    }))
}

/// 读取 ffmpeg stderr 直到 EOF，收集全文并按段解析进度上报事件。
/// ffmpeg 的进度更新用 `\r` 分隔同一行，`BufReader::lines()` 只按 `\n` 切分，
/// 因此这里按字节流读取并按 `\r`/`\n` 手工分段，保证每个 time= 更新都能解析。
fn collect_stderr<R: std::io::Read>(
    stderr_pipe: R,
    stdout: &Arc<Mutex<io::Stdout>>,
    duration: f64,
) -> String {
    let mut collected = String::new();
    let mut reader = BufReader::new(stderr_pipe);
    let mut segment = String::new();
    let mut buffer = [0u8; 4096];

    loop {
        let read = if let Ok(read) = reader.read(&mut buffer) {
            read
        } else {
            break;
        };
        if read == 0 {
            break;
        }

        let text = String::from_utf8_lossy(&buffer[..read]);
        for character in text.chars() {
            if character == '\r' || character == '\n' {
                if !segment.is_empty() {
                    collected.push_str(&segment);
                    collected.push('\n');
                    report_progress_if_any(&segment, duration, stdout);
                    segment.clear();
                }
            } else {
                segment.push(character);
            }
        }
    }

    if !segment.is_empty() {
        collected.push_str(&segment);
        collected.push('\n');
        report_progress_if_any(&segment, duration, stdout);
    }

    collected
}

/// 若段落包含 `time=` 进度信息，则上报 `video.progress` 事件。
fn report_progress_if_any(segment: &str, duration: f64, stdout: &Arc<Mutex<io::Stdout>>) {
    if duration <= 0.0 {
        return;
    }
    let fraction = parse_progress_fraction(segment, duration);
    if fraction > 0.0 {
        if let Ok(mut guard) = stdout.lock() {
            let payload = format!(
                "{{\"event\":\"video.progress\",\"data\":{{\"fraction\":{}}}}}\n",
                fraction
            );
            let _ = guard.write_all(payload.as_bytes());
            let _ = guard.flush();
        }
    }
}

/// 与 Node 侧 `parseProgressFraction` 对齐：从 `time=HH:MM:SS.mmm` 解析进度。
fn parse_progress_fraction(text: &str, duration: f64) -> f64 {
    if duration <= 0.0 {
        return 0.0;
    }
    let Some(index) = text.find("time=") else {
        return 0.0;
    };

    let rest = &text[index + "time=".len()..];
    let mut parts = rest.split(':');

    let hours: f64 = parts.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0.0);
    let minutes: f64 = parts.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0.0);
    let seconds: f64 = parts
        .next()
        .map(parse_seconds_field)
        .unwrap_or(0.0);

    let current = hours * 3600.0 + minutes * 60.0 + seconds;
    (current / duration).min(1.0)
}

/// 解析秒字段：取开头的数字与小数点，忽略后续非数字前缀（如 ` bitrate=`）。
fn parse_seconds_field(value: &str) -> f64 {
    let trimmed = value.trim();
    let end = trimmed
        .find(|character: char| !(character.is_ascii_digit() || character == '.'))
        .unwrap_or(trimmed.len());
    trimmed[..end].parse().unwrap_or(0.0)
}

fn required_string(params: &Value, key: &str) -> Result<String, ErrorBody> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: format!("缺少参数: {}", key),
        })
}

fn required_string_array(params: &Value, key: &str) -> Result<Vec<String>, ErrorBody> {
    params
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<String>>()
        })
        .filter(|items: &Vec<String>| !items.is_empty())
        .ok_or_else(|| ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: format!("缺少参数: {}", key),
        })
}