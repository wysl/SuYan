//! 阶段 2 业务方法：媒体文件扫描与文件哈希。
//!
//! 语义与 Node 侧对齐：
//! - `library.scanMediaFiles` 对齐 `externalLibraryScanner.collectMediaFiles`：
//!   目录读取或 stat 失败时跳过并记录到 `errors`，不使整体失败。
//! - `files.sha256` 对齐 `deduplicateScanner.collectHashedItems` 的 sha256，
//!   但改为分块流式计算，避免整文件读入内存。
//!
//! 阶段 5：大规模扫描流式化。
//! 单个 NDJSON 响应受 `MAX_MESSAGE_BYTES`（4MB）限制，10 万文件一次返回约 11MB，
//! 会超出限制。因此新增基于服务端游标的分页协议：
//! - `library.scanStart`：校验目录并创建扫描会话，返回 `sessionId`；
//! - `library.scanNext`：从游标继续扫描，返回一批文件直到 `pageSize` 或扫描完成；
//! - `library.scanEnd`：释放会话。
//! 目录只遍历一次，游标保存在内存中，避免 offset 分页导致的 O(n²) 重复遍历。

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

use serde::Serialize;
use serde_json::{json, Value};
use sha2::Digest;

use crate::ErrorBody;

/// 全局扫描会话注册表。会话占内存很小（一个路径栈），
/// 由 `library.scanEnd` 或 `system.shutdown` 释放。
static SCAN_SESSIONS: LazyLock<Mutex<HashMap<String, ScanCursor>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
/// 会话 id 计数器，配合时间戳保证唯一。
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
/// 会话注册表上限，防止异常客户端无限创建会话拖垮 Sidecar。
const MAX_SCAN_SESSIONS: usize = 32;

/// 扫描会话：保存目录遍历游标，支持跨请求分批返回结果。
struct ScanCursor {
    root: PathBuf,
    recursive: bool,
    extensions: Vec<String>,
    pending_dirs: Vec<PathBuf>,
    errors: Vec<String>,
    done: bool,
}

/// 与 Node 侧 `ScannedExternalMediaFile` 对齐的扫描结果。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedMediaFile {
    pub absolute_path: String,
    pub relative_path: String,
    pub size: u64,
    pub mtime_ms: u128,
}

/// `library.scanMediaFiles`：扫描目录并收集受支持扩展名的媒体文件。
/// 参数：`{ rootPath, recursive, extensions }`。
pub fn handle_scan_media_files(params: &Value) -> Result<Value, ErrorBody> {
    let root_path = required_string(params, "rootPath")?;
    let recursive = params
        .get("recursive")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let extensions = parse_extensions(params)?;

    if extensions.is_empty() {
        return Err(ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: "extensions 不能为空".to_owned(),
        });
    }

    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err(ErrorBody {
            code: "LIBRARY_ROOT_UNAVAILABLE".to_owned(),
            message: format!("素材目录不可访问: {}", root_path),
        });
    }

    let mut files = Vec::new();
    let mut errors = Vec::new();
    walk(&root, recursive, &extensions, &mut files, &mut errors);

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(json!({
        "files": files,
        "errors": errors,
    }))
}

/// `library.scanStart`：创建流式扫描会话，返回 `{ sessionId, totalHint }`。
/// 参数：`{ rootPath, recursive, extensions }`。
/// 目录不存在或不可访问时返回 `LIBRARY_ROOT_UNAVAILABLE`。
pub fn handle_scan_start(params: &Value) -> Result<Value, ErrorBody> {
    let root_path = required_string(params, "rootPath")?;
    let recursive = params
        .get("recursive")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let extensions = parse_extensions(params)?;

    if extensions.is_empty() {
        return Err(ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: "extensions 不能为空".to_owned(),
        });
    }

    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err(ErrorBody {
            code: "LIBRARY_ROOT_UNAVAILABLE".to_owned(),
            message: format!("素材目录不可访问: {}", root_path),
        });
    }

    let session_id = format!("scan-{}-{}", std::process::id(), SESSION_COUNTER.fetch_add(1, Ordering::SeqCst));

    {
        let mut sessions = SCAN_SESSIONS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if sessions.len() >= MAX_SCAN_SESSIONS {
            return Err(ErrorBody {
                code: "SCAN_TOO_MANY_SESSIONS".to_owned(),
                message: "扫描会话过多，请先结束旧会话".to_owned(),
            });
        }
        sessions.insert(
            session_id.clone(),
            ScanCursor {
                root,
                recursive,
                extensions,
                pending_dirs: Vec::new(),
                errors: Vec::new(),
                done: false,
            },
        );
    }

    Ok(json!({
        "sessionId": session_id,
    }))
}

/// `library.scanNext`：从游标继续扫描，返回一批结果。
/// 参数：`{ sessionId, pageSize }`。返回：
/// `{ done, files, errors }`。`done=true` 表示扫描完成，之后应调用 `scanEnd`。
pub fn handle_scan_next(params: &Value) -> Result<Value, ErrorBody> {
    let session_id = required_string(params, "sessionId")?;
    let page_size = params
        .get("pageSize")
        .and_then(Value::as_u64)
        .unwrap_or(5000)
        .clamp(1, 100_000) as usize;

    let mut sessions = SCAN_SESSIONS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(cursor) = sessions.get_mut(&session_id) else {
        return Err(ErrorBody {
            code: "SCAN_SESSION_NOT_FOUND".to_owned(),
            message: "扫描会话不存在或已结束".to_owned(),
        });
    };

    let mut files: Vec<ScannedMediaFile> = Vec::new();
    advance_scan(cursor, page_size, &mut files);

    let done = cursor.done;
    let errors = cursor.errors.clone();

    Ok(json!({
        "done": done,
        "files": files,
        "errors": errors,
        "sessionId": session_id,
    }))
}

/// `library.scanEnd`：释放扫描会话。
/// 参数：`{ sessionId }`。返回：`{ status: "ok" }`。
pub fn handle_scan_end(params: &Value) -> Result<Value, ErrorBody> {
    let session_id = required_string(params, "sessionId")?;
    SCAN_SESSIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&session_id);
    Ok(json!({ "status": "ok" }))
}

/// 释放所有扫描会话。`system.shutdown` 时调用，避免会话残留。
pub fn clear_scan_sessions() {
    SCAN_SESSIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
}

/// 从游标继续遍历，直到收集满 `page_size` 个文件或遍历完成。
/// 复用了 `walk` 的目录遍历逻辑，但把结果分批返回。
fn advance_scan(cursor: &mut ScanCursor, page_size: usize, files: &mut Vec<ScannedMediaFile>) {
    if cursor.done {
        return;
    }
    if cursor.pending_dirs.is_empty() {
        cursor.pending_dirs.push(cursor.root.clone());
    }

    while files.len() < page_size {
        let Some(directory) = cursor.pending_dirs.pop() else {
            cursor.done = true;
            break;
        };

        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                cursor
                    .errors
                    .push(format!("read_dir {}: {}", directory.display(), error));
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    cursor
                        .errors
                        .push(format!("read_dir entry {}: {}", directory.display(), error));
                    continue;
                }
            };
            let entry_path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    cursor
                        .errors
                        .push(format!("file_type {}: {}", entry_path.display(), error));
                    continue;
                }
            };

            if file_type.is_dir() {
                if cursor.recursive {
                    cursor.pending_dirs.push(entry_path);
                }
            } else if file_type.is_file() && has_supported_extension(&entry_path, &cursor.extensions) {
                match stat_file(&cursor.root, &entry_path) {
                    Some(scanned) => files.push(scanned),
                    None => cursor
                        .errors
                        .push(format!("stat {}: 非文件或无法读取", entry_path.display())),
                }
            }
        }
    }

    // 处理每一页恰好填满 page_size 的情况：本页处理过程中目录栈已耗尽，
    // 但外层 while 因 files.len() == page_size 提前退出，需在此标记扫描完成。
    if cursor.pending_dirs.is_empty() {
        cursor.done = true;
    }
}

/// `files.sha256`：分块流式计算文件 sha256。
/// 参数：`{ filePath }`。返回：`{ hash, size }`。
pub fn handle_sha256_file(params: &Value) -> Result<Value, ErrorBody> {
    let file_path = required_string(params, "filePath")?;
    let path = PathBuf::from(&file_path);

    let mut file = fs::File::open(&path).map_err(|error| ErrorBody {
        code: "FILE_OPEN_FAILED".to_owned(),
        message: format!("无法打开文件 {}: {}", file_path, error),
    })?;
    let size = file
        .metadata()
        .map_err(|error| ErrorBody {
            code: "FILE_STAT_FAILED".to_owned(),
            message: format!("无法读取文件信息 {}: {}", file_path, error),
        })?
        .len();

    let mut hasher = sha2::Sha256::new();
    // 堆上分配读取缓冲，避免大栈帧在 LTO 内联后压爆 Windows 默认 1MB 栈。
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| ErrorBody {
            code: "FILE_READ_FAILED".to_owned(),
            message: format!("读取文件失败 {}: {}", file_path, error),
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(json!({
        "hash": to_hex(&hasher.finalize()),
        "size": size,
    }))
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

/// 解析并规范化 `extensions` 参数：小写、去除空白、去空项。
fn parse_extensions(params: &Value) -> Result<Vec<String>, ErrorBody> {
    Ok(params
        .get("extensions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.trim().to_ascii_lowercase()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default())
}

fn walk(
    root: &Path,
    recursive: bool,
    extensions: &[String],
    files: &mut Vec<ScannedMediaFile>,
    errors: &mut Vec<String>,
) {
    let mut pending: Vec<PathBuf> = vec![root.to_path_buf()];

    while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                errors.push(format!("read_dir {}: {}", directory.display(), error));
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    errors.push(format!("read_dir entry {}: {}", directory.display(), error));
                    continue;
                }
            };
            let entry_path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    errors.push(format!("file_type {}: {}", entry_path.display(), error));
                    continue;
                }
            };

            if file_type.is_dir() {
                if recursive {
                    pending.push(entry_path);
                }
            } else if file_type.is_file() && has_supported_extension(&entry_path, extensions) {
                match stat_file(root, &entry_path) {
                    Some(scanned) => files.push(scanned),
                    None => errors.push(format!("stat {}: 非文件或无法读取", entry_path.display())),
                }
            }
        }
    }
}

fn has_supported_extension(path: &Path, extensions: &[String]) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    extensions
        .iter()
        .any(|supported| supported == &extension.to_ascii_lowercase())
}

fn stat_file(root: &Path, path: &Path) -> Option<ScannedMediaFile> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let relative_path = path.strip_prefix(root).ok()?.to_string_lossy().into_owned();
    let mtime_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    Some(ScannedMediaFile {
        absolute_path: path.to_string_lossy().into_owned(),
        relative_path,
        size: metadata.len(),
        mtime_ms,
    })
}

/// 小端 hex 编码，与 Node 的 `digest("hex")`（小写）一致。
fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}