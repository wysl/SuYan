use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;

mod ops;
mod ops_archive;
mod ops_image;
mod ops_video;

/// 协议版本号。与 Node 侧 `RustCoreClient` 握手校验保持一致。
pub const PROTOCOL_VERSION: u32 = 1;
/// 单条消息最大长度（字节），与 Node 侧限制保持一致。
pub const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub protocol_version: u32,
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct Response {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
}

/// 处理单个请求，返回结果或结构化错误。
/// `video.compressFile` 会向 stdout 上报进度事件，因此需要共享的 stdout 句柄。
fn handle(request: &Request, stdout: &Arc<Mutex<io::Stdout>>) -> Result<Value, ErrorBody> {
    if request.protocol_version != PROTOCOL_VERSION {
        return Err(ErrorBody {
            code: "UNSUPPORTED_PROTOCOL".to_owned(),
            message: format!(
                "不支持的协议版本: {}, 需要 {}",
                request.protocol_version, PROTOCOL_VERSION
            ),
        });
    }

    match request.method.as_str() {
        "system.handshake" => Ok(serde_json::json!({
            "status": "ok",
            "protocolVersion": PROTOCOL_VERSION,
            "implementation": "suyan-core",
            "version": env!("CARGO_PKG_VERSION"),
        })),
        "system.ping" => Ok(serde_json::json!({
            "status": "ok",
            "protocolVersion": PROTOCOL_VERSION,
        })),
        "system.shutdown" => {
            tracing::info!("收到 system.shutdown，准备退出");
            ops::clear_scan_sessions();
            Ok(serde_json::json!({ "status": "shutting-down" }))
        }
        "library.scanMediaFiles" => ops::handle_scan_media_files(&request.params),
        "library.scanStart" => ops::handle_scan_start(&request.params),
        "library.scanNext" => ops::handle_scan_next(&request.params),
        "library.scanEnd" => ops::handle_scan_end(&request.params),
        "files.sha256" => ops::handle_sha256_file(&request.params),
        "archive.createZip" => ops_archive::handle_create_zip(&request.params),
        "image.compressFile" => ops_image::handle_compress_file(&request.params),
        "video.compressFile" => ops_video::run_ffmpeg(&request.params, stdout),
        "video.cancel" => ops_video::handle_cancel_video(),
        _ => Err(ErrorBody {
            code: "METHOD_NOT_FOUND".to_owned(),
            message: format!("未知方法: {}", request.method),
        }),
    }
}

fn write_response(stdout: &Arc<Mutex<io::Stdout>>, response: &Response) {
    let Ok(mut serialized) = serde_json::to_string(response) else {
        return;
    };
    serialized.push('\n');
    let mut handle = stdout.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Err(error) = handle.write_all(serialized.as_bytes()) {
        tracing::error!("写入 stdout 失败: {}", error);
        return;
    }
    if let Err(error) = handle.flush() {
        tracing::error!("刷新 stdout 失败: {}", error);
    }
}

fn main() -> anyhow::Result<()> {
    init_tracing();
    tracing::info!("suyan-core 启动, version={}", env!("CARGO_PKG_VERSION"));

    let stdin = io::stdin();
    let stdout = Arc::new(Mutex::new(io::stdout()));
    let mut video_thread: Option<std::thread::JoinHandle<()>> = None;

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                tracing::error!("读取 stdin 失败: {}", error);
                break;
            }
        };

        if line.len() > MAX_MESSAGE_BYTES {
            tracing::error!("请求消息超过长度限制: {} 字节", line.len());
            continue;
        }

        tracing::info!("收到请求行: {}", line);
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(_) => {
                tracing::error!("请求 JSON 无效");
                continue;
            }
        };

        if request.method == "video.compressFile" {
            // 长任务：在后台线程执行，主循环继续读取 stdin，
            // 从而能并发处理 `video.cancel` 与 `system.shutdown`。
            let stdout_handle = Arc::clone(&stdout);
            let child_thread = std::thread::spawn(move || {
                let response = match handle(&request, &stdout_handle) {
                    Ok(result) => Response {
                        id: request.id,
                        result: Some(result),
                        error: None,
                    },
                    Err(error) => Response {
                        id: request.id,
                        result: None,
                        error: Some(error),
                    },
                };
                write_response(&stdout_handle, &response);
            });
            if let Some(previous) = video_thread.take() {
                // Node 侧串行调用，理论上不会并发；安全起见等待上一个结束。
                tracing::warn!("上一个视频压缩任务尚未结束，等待其结束");
                let _ = previous.join();
            }
            video_thread = Some(child_thread);
            continue;
        }

        let response = match handle(&request, &stdout) {
            Ok(result) => Response {
                id: request.id,
                result: Some(result),
                error: None,
            },
            Err(error) => Response {
                id: request.id,
                result: None,
                error: Some(error),
            },
        };
        write_response(&stdout, &response);

        if request.method == "system.shutdown" {
            // 通知正在运行的视频任务退出，等它 kill ffmpeg 后进程退出，
            // 避免把 ffmpeg 子进程遗留成孤儿进程。
            ops_video::request_shutdown();
            if let Some(previous) = video_thread.take() {
                let _ = previous.join();
            }
            break;
        }
    }

    tracing::info!("suyan-core 正常退出");
    Ok(())
}

fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(io::stderr)
        .with_target(false)
        .try_init();
}