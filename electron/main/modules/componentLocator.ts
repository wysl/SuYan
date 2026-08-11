// 已安装按需组件的同步定位器：供 getFfmpegPath 等同步解析路径优先使用。
// 纯路径逻辑（resolveComponentExeInBaseSync）可单测；electron app 目录惰性获取，非 electron 环境返回 null。
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const COMPONENTS_DIR_NAME = "components";

/** 在给定的组件根目录下解析某组件当前版本的可执行文件路径（同步、纯逻辑）。 */
export function resolveComponentExeInBaseSync(
  baseComponentsDir: string,
  componentId: string,
  exeName: string,
): string | null {
  try {
    const currentPath = path.join(baseComponentsDir, componentId, "current.json");
    const parsed = JSON.parse(fs.readFileSync(currentPath, "utf8")) as {
      version?: unknown;
      platform?: unknown;
    };
    if (typeof parsed.version !== "string" || typeof parsed.platform !== "string") {
      return null;
    }
    const exePath = path.join(baseComponentsDir, componentId, parsed.version, parsed.platform, exeName);
    return fs.existsSync(exePath) ? exePath : null;
  } catch {
    return null;
  }
}

/** 惰性获取 electron userData 下的组件根目录；非 electron 环境（如单测）返回 null。 */
export function getComponentsBaseDir(): string | null {
  try {
    const runtimeRequire = createRequire(__filename);
    const electron = runtimeRequire("electron") as { app?: { getPath?: (name: string) => string } };
    const userDataDir = electron.app?.getPath?.("userData");
    return userDataDir ? path.join(userDataDir, COMPONENTS_DIR_NAME) : null;
  } catch {
    return null;
  }
}

/** 同步解析已安装组件可执行文件路径：读取 electron 组件根目录 → current.json → 版本/平台目录。 */
export function resolveInstalledComponentExeSync(componentId: string, exeName: string): string | null {
  const baseDir = getComponentsBaseDir();
  return baseDir ? resolveComponentExeInBaseSync(baseDir, componentId, exeName) : null;
}
