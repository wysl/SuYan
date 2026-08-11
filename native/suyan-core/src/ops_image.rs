//! 阶段 4 业务方法：图片压缩。
//!
//! `image.compressFile`：解码源图 → 可选限边缩放 → 按目标格式编码。
//! 语义与 Node 侧 `imageCompressor.compressBuffer` 对齐：
//! - `format="webp"`：有损 WebP（libwebp，`webp` crate）
//! - `ext=.jpg/.jpeg`：JPEG（`jpeg-encoder`，quality 0-100）
//! - `ext=.png`：PNG 最佳压缩 + 自适应滤波（`png` crate）
//!
//! 输出写入 Node 传入的临时 `outputPath`，返回 `{outputBytes,width,height}`。
//! 由 Node 侧读取输出、校验、替换原文件；Rust 不做文件替换，保持职责单一。

use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use crate::ErrorBody;

/// `image.compressFile`：压缩单张图片。
/// 参数：`{ sourcePath, outputPath, ext, quality, format, maxSide? }`。
pub fn handle_compress_file(params: &Value) -> Result<Value, ErrorBody> {
    let source_path = required_string(params, "sourcePath")?;
    let output_path = required_string(params, "outputPath")?;
    let quality = params
        .get("quality")
        .and_then(Value::as_u64)
        .unwrap_or(80)
        .clamp(0, 100) as u8;
    let format = params.get("format").and_then(Value::as_str).unwrap_or("keep");
    let ext = params
        .get("ext")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let max_side = params.get("maxSide").and_then(Value::as_u64).unwrap_or(0);

    let image = image::open(&source_path).map_err(|error| ErrorBody {
        code: "IMAGE_DECODE_FAILED".to_owned(),
        message: format!("无法解码图片 {}: {}", source_path, error),
    })?;

    let image = resize_if_needed(image, max_side);
    let (width, height) = (image.width(), image.height());

    if format == "webp" {
        encode_webp(&image, Path::new(&output_path), quality)?;
    } else if ext == ".jpg" || ext == ".jpeg" {
        encode_jpeg(&image, Path::new(&output_path), quality)?;
    } else if ext == ".png" {
        encode_png(&image, Path::new(&output_path))?;
    } else {
        return Err(ErrorBody {
            code: "UNSUPPORTED_FORMAT".to_owned(),
            message: format!("不支持的输出格式: {}", ext),
        });
    }

    let output_bytes = fs::metadata(&output_path)
        .map_err(|error| ErrorBody {
            code: "IMAGE_STAT_FAILED".to_owned(),
            message: format!("无法读取压缩结果 {}: {}", output_path, error),
        })?
        .len();

    Ok(json!({
        "outputBytes": output_bytes,
        "width": width,
        "height": height,
    }))
}

/// 限边缩放：`fit=inside, withoutEnlargement`，与 sharp `resize({fit:"inside"})` 行为一致。
fn resize_if_needed(image: image::DynamicImage, max_side: u64) -> image::DynamicImage {
    if max_side == 0 {
        return image;
    }
    let (width, height) = (image.width(), image.height());
    let max_side = max_side as f32;
    if width.max(height) as f32 <= max_side {
        return image;
    }
    let scale = max_side / width.max(height) as f32;
    let new_width = ((width as f32 * scale).round() as u32).max(1);
    let new_height = ((height as f32 * scale).round() as u32).max(1);
    image.resize(new_width, new_height, image::imageops::FilterType::Triangle)
}

fn encode_webp(image: &image::DynamicImage, output_path: &Path, quality: u8) -> Result<(), ErrorBody> {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
    let encoded = encoder.encode(quality as f32);
    fs::write(output_path, &*encoded).map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("写入 WebP 失败 {}: {}", output_path.display(), error),
    })
}

fn encode_jpeg(image: &image::DynamicImage, output_path: &Path, quality: u8) -> Result<(), ErrorBody> {
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();
    let encoder = jpeg_encoder::Encoder::new_file(output_path, quality).map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("创建 JPEG 文件失败 {}: {}", output_path.display(), error),
    })?;
    encoder
        .encode(
            rgb.as_raw(),
            u16::try_from(width).unwrap_or(u16::MAX),
            u16::try_from(height).unwrap_or(u16::MAX),
            jpeg_encoder::ColorType::Rgb,
        )
        .map_err(|error| ErrorBody {
            code: "IMAGE_ENCODE_FAILED".to_owned(),
            message: format!("编码 JPEG 失败: {}", error),
        })
}

fn encode_png(image: &image::DynamicImage, output_path: &Path) -> Result<(), ErrorBody> {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let file = fs::File::create(output_path).map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("创建 PNG 文件失败 {}: {}", output_path.display(), error),
    })?;
    let mut encoder = png::Encoder::new(file, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Best);
    encoder.set_adaptive_filter(png::AdaptiveFilterType::Adaptive);
    let mut writer = encoder.write_header().map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("写入 PNG 头失败: {}", error),
    })?;
    writer.write_image_data(rgba.as_raw()).map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("写入 PNG 数据失败: {}", error),
    })?;
    writer.finish().map_err(|error| ErrorBody {
        code: "IMAGE_ENCODE_FAILED".to_owned(),
        message: format!("结束 PNG 写入失败: {}", error),
    })
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