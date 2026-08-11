#!/usr/bin/env node
// 素言按需组件 Release 签名工具（离线运行；绝不打进 App 包，因其接触私钥）。
// 产物与 electron/main/modules/componentSecurity.ts 的校验逻辑严格对应：
//   manifest.json      —— 被签名的原始字节（客户端逐字节验签，勿再格式化）
//   manifest.json.sig  —— Ed25519 原始签名字节
//   ffmpeg-win32-x64.zip —— 组件包（含 ffmpeg.exe[、LICENSE]）
// 用法：
//   node scripts/components/sign-component-release.cjs keygen [--out <dir>]
//   node scripts/components/sign-component-release.cjs sign --ffmpeg <ffmpeg.exe> [--license <LICENSE>] --key <private.pem> [--version <v>] [--out <dir>]
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// 需与 componentConfig.ts 保持一致（.cjs 运行时无法 require .ts，故此处镜像；改动须同步）。
const COMPONENT_ID = "ffmpeg";
const PLATFORM = "win32-x64";
const DEFAULT_VERSION = "6.0-suyan.1";
const ARCHIVE_NAME = "ffmpeg-win32-x64.zip";
const EXE_NAME = "ffmpeg.exe";
const MANIFEST_NAME = "manifest.json";
const SIGNATURE_NAME = "manifest.json.sig";

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function assertPeBinary(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(2);
    fs.readSync(descriptor, header, 0, 2, 0);
    if (header[0] !== 0x4d || header[1] !== 0x5a) {
      throw new Error(`不是有效的 Windows 可执行文件（缺少 MZ 头）：${filePath}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

async function buildZip(entries) {
  const JSZip = require("jszip");
  const zip = new JSZip();
  for (const [name, content] of entries) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

function keygen(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePath = path.join(outDir, "ffmpeg-signing.private.pem");
  const publicPath = path.join(outDir, "ffmpeg-signing.public.pem");
  fs.writeFileSync(privatePath, privatePem, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(publicPath, publicPem, "utf8");
  return { privatePath, publicPath, publicPem };
}

async function sign(options) {
  const { ffmpegPath, licensePath, privateKeyPath, version, outDir } = options;
  if (!ffmpegPath || typeof ffmpegPath !== "string" || !fs.existsSync(ffmpegPath)) {
    throw new Error(`--ffmpeg 路径无效：${ffmpegPath}`);
  }
  if (!privateKeyPath || typeof privateKeyPath !== "string" || !fs.existsSync(privateKeyPath)) {
    throw new Error(`--key 私钥路径无效：${privateKeyPath}`);
  }
  assertPeBinary(ffmpegPath);

  const files = [{ name: EXE_NAME, content: fs.readFileSync(ffmpegPath) }];
  if (licensePath && typeof licensePath === "string") {
    if (!fs.existsSync(licensePath)) throw new Error(`--license 路径无效：${licensePath}`);
    files.push({ name: "LICENSE", content: fs.readFileSync(licensePath) });
  }

  const zipBuffer = await buildZip(files.map((file) => [file.name, file.content]));
  const manifest = {
    componentId: COMPONENT_ID,
    version: typeof version === "string" && version ? version : DEFAULT_VERSION,
    platform: PLATFORM,
    archive: { name: ARCHIVE_NAME, sha256: sha256Hex(zipBuffer), size: zipBuffer.length },
    files: files.map((file) => ({ name: file.name, sha256: sha256Hex(file.content), size: file.content.length })),
    createdAt: new Date().toISOString(),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath, "utf8"));
  const signature = crypto.sign(null, manifestBytes, privateKey);

  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, ARCHIVE_NAME);
  const manifestPath = path.join(outDir, MANIFEST_NAME);
  const signaturePath = path.join(outDir, SIGNATURE_NAME);
  fs.writeFileSync(zipPath, zipBuffer);
  fs.writeFileSync(manifestPath, manifestBytes); // 必须写入被签名的原始字节
  fs.writeFileSync(signaturePath, signature);
  return { zipPath, manifestPath, signaturePath, manifest };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "keygen") {
    const outDir = typeof args.out === "string" ? args.out : path.join(process.cwd(), ".secrets", "components");
    const { privatePath, publicPath, publicPem } = keygen(outDir);
    console.log("已生成 Ed25519 签名密钥对。");
    console.log(`私钥（务必保密、立即备份、切勿提交/分享）：${privatePath}`);
    console.log(`公钥：${publicPath}`);
    console.log("\n把下面这段公钥 PEM 填入 componentConfig.ts 的 COMPONENT_SIGNING_PUBLIC_KEY_PEM：\n");
    console.log(publicPem);
    return;
  }
  if (command === "sign") {
    const version = typeof args.version === "string" ? args.version : DEFAULT_VERSION;
    const outDir = typeof args.out === "string" ? args.out : path.join(process.cwd(), "release-components", version);
    const result = await sign({
      ffmpegPath: args.ffmpeg,
      licensePath: args.license,
      privateKeyPath: args.key,
      version,
      outDir,
    });
    console.log("已产出并签名组件：");
    console.log(`  ${result.zipPath}`);
    console.log(`  ${result.manifestPath}`);
    console.log(`  ${result.signaturePath}`);
    console.log("\n把以上三个文件作为 Release 资产上传到固定地址（形如）：");
    console.log(`  https://github.com/<owner>/suyan-components/releases/download/ffmpeg-${result.manifest.version}/`);
    console.log("再把该基址填入 componentConfig.ts 的 COMPONENT_RELEASE_BASE_URL。");
    return;
  }
  console.error("用法：keygen [--out <dir>] | sign --ffmpeg <exe> [--license <file>] --key <private.pem> [--version <v>] [--out <dir>]");
  process.exitCode = 1;
}

module.exports = { keygen, sign, sha256Hex, buildZip };

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
