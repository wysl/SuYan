import { FFMPEG_COMPONENT_ID, FFMPEG_EXECUTABLE_NAME } from "../modules/componentConfig";
import { resolveInstalledComponentExeSync } from "../modules/componentLocator";

let ffmpegPathCache: string | null | undefined;

/** 安装/卸载按需组件后调用，令下次 getFfmpegPath 重新解析（否则命中模块级缓存）。 */
export function resetFfmpegPathCache(): void {
  ffmpegPathCache = undefined;
}

export function getFfmpegPath(): string | null {
  if (ffmpegPathCache !== undefined) {
    return ffmpegPathCache;
  }

  // 解绑后仅取按需安装的组件可执行文件；不再回退内置 ffmpeg-static / vendor。
  ffmpegPathCache = resolveInstalledComponentExeSync(FFMPEG_COMPONENT_ID, FFMPEG_EXECUTABLE_NAME);

  return ffmpegPathCache;
}
