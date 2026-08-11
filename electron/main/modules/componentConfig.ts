// 按需组件（如 FFmpeg）的固定配置与类型定义。
// 安全约束：下载 URL 固定内置、公钥内置，Renderer 不得指定 URL 或本地执行路径。

export type ComponentFileEntry = {
  /** ZIP 内的相对路径，例如 "ffmpeg.exe" */
  name: string;
  /** 该文件解压后的 SHA-256（小写十六进制） */
  sha256: string;
  /** 文件字节数 */
  size: number;
};

export type ComponentArchiveInfo = {
  /** Release 中的 ZIP 文件名，例如 "ffmpeg-win32-x64.zip" */
  name: string;
  /** ZIP 整体 SHA-256（小写十六进制） */
  sha256: string;
  /** ZIP 字节数 */
  size: number;
};

/** 组件清单（manifest.json）。清单本身由 Ed25519 私钥签名，客户端用内置公钥校验。 */
export type ComponentManifest = {
  componentId: string; // "ffmpeg"
  version: string; // "6.0-suyan.1"
  platform: string; // "win32-x64"
  archive: ComponentArchiveInfo;
  files: ComponentFileEntry[];
  createdAt?: string;
};

export type ComponentExtractLimits = {
  maxArchiveBytes: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxEntries: number;
};

/** 解压安全上限：防 ZIP Bomb / 超大下载。FFmpeg 组件约 80MB，上限留足冗余。 */
export const DEFAULT_COMPONENT_LIMITS: ComponentExtractLimits = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntryBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxEntries: 64,
};

/** 当前平台标识，用于拼接组件目录与 Release 资产名。 */
export const CURRENT_COMPONENT_PLATFORM = "win32-x64";

/** FFmpeg 组件的固定版本号。素言版本升级时若仍兼容则复用同一组件版本。
 *  当前值对应 ffmpeg-static@5.2.0 实际打包的 ffmpeg 6.0（gyan.dev essentials，GPLv3）。 */
export const FFMPEG_COMPONENT_VERSION = "6.0-suyan.1";
export const FFMPEG_COMPONENT_ID = "ffmpeg";
/** FFmpeg 可执行文件名（win32-x64）。用于解析安装目录与自检。 */
export const FFMPEG_EXECUTABLE_NAME = "ffmpeg.exe";

// 素言按需组件的固定 Release 基址（suyan-components 仓库）。客户端仅从此固定地址拉取，Renderer 不得指定。
// 当前为开发/预发布：ffmpeg 6.0-suyan.1，由开发签名密钥签发；正式 GA 前应轮换密钥并重新签发/发布。
export const COMPONENT_RELEASE_BASE_URL =
  "https://github.com/guliacer/suyan-components/releases/download/ffmpeg-6.0-suyan.1";

// 素言按需组件的签名验签公钥（Ed25519 SPKI PEM）。留空时验签 fail-closed（拒绝所有安装）。
// 当前为开发/预发签名密钥：私钥在 .secrets/components/ffmpeg-signing.private.pem（已 gitignore，务必备份保密）。
// 正式发布前建议用 scripts/components/sign-component-release.cjs keygen 重新生成并替换此处（密钥轮换）。
export const COMPONENT_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEADbBXcHSGGnBCGdigY8h5QVRSadQvapjj1FoYt3tz3GY=
-----END PUBLIC KEY-----
`;
