//! 阶段 3：归档（ZIP）业务方法。
//!
//! `archive.createZip`：流式创建 ZIP 文件。逐文件读入-压缩-写出，
//! 常驻内存恒定，避免 Node 侧 JSZip 全量读入内存导致大库导出卡顿。

use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::ErrorBody;

/// `archive.createZip`：流式创建 ZIP 文件。
/// 参数：`{ entries: [{ zipPath, sourcePath }], outputPath }`。
pub fn handle_create_zip(params: &Value) -> Result<Value, ErrorBody> {
    let output_path = required_string(params, "outputPath")?;
    let entries = required_array(params, "entries")?;

    if entries.is_empty() {
        return Err(ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: "entries 不能为空".to_owned(),
        });
    }

    let output = PathBuf::from(&output_path);
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| ErrorBody {
            code: "ZIP_OUTPUT_DIR_FAILED".to_owned(),
            message: format!("无法创建输出目录 {}: {}", parent.display(), error),
        })?;
    }

    let file = File::create(&output).map_err(|error| ErrorBody {
        code: "ZIP_OUTPUT_OPEN_FAILED".to_owned(),
        message: format!("无法创建 ZIP 文件 {}: {}", output.display(), error),
    })?;
    let mut writer = ZipWriter::new(BufWriter::new(file));

    let mut missing: Vec<String> = Vec::new();

    for entry in entries {
        let zip_path = entry
            .get("zipPath")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_params("zipPath"))?;
        let source_path = entry
            .get("sourcePath")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_params("sourcePath"))?;

        // 统一用正斜杠，与 JSZip 的跨平台路径一致，避免反斜杠转义问题。
        let normalized_zip_path = zip_path.replace('\\', "/");

        if !Path::new(source_path).is_file() {
            missing.push(source_path.to_owned());
            continue;
        }

        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        writer
            .start_file(&normalized_zip_path, options)
            .map_err(zip_error)?;

        let file = File::open(source_path).map_err(|error| ErrorBody {
            code: "ZIP_SOURCE_OPEN_FAILED".to_owned(),
            message: format!("无法打开源文件 {}: {}", source_path, error),
        })?;
        let mut reader = BufReader::new(file);
        std::io::copy(&mut reader, &mut writer).map_err(io_error)?;
    }

    writer.finish().map_err(zip_error)?;

    if !missing.is_empty() {
        return Err(ErrorBody {
            code: "ZIP_MEDIA_MISSING".to_owned(),
            message: format!("源文件缺失，无法导出: {}", missing.join(", ")),
        });
    }

    Ok(json!({
        "status": "ok",
        "outputPath": output_path,
        "entryCount": entries.len(),
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

fn required_array<'a>(params: &'a Value, key: &str) -> Result<&'a Vec<Value>, ErrorBody> {
    params
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| ErrorBody {
            code: "INVALID_PARAMS".to_owned(),
            message: format!("缺少参数: {}", key),
        })
}

fn invalid_params(key: &str) -> ErrorBody {
    ErrorBody {
        code: "INVALID_PARAMS".to_owned(),
        message: format!("entry 缺少参数: {}", key),
    }
}

fn io_error(error: std::io::Error) -> ErrorBody {
    ErrorBody {
        code: "ZIP_WRITE_FAILED".to_owned(),
        message: format!("ZIP 写入失败: {}", error),
    }
}

fn zip_error(error: zip::result::ZipError) -> ErrorBody {
    ErrorBody {
        code: "ZIP_WRITE_FAILED".to_owned(),
        message: format!("ZIP 写入失败: {}", error),
    }
}