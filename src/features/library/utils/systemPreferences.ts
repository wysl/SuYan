export const systemPreferenceSections = [
  "proxy",
  "performance",
  "modules",
  "startupGallery",
] as const;

export type SystemPreferenceSection = (typeof systemPreferenceSections)[number];

export const defaultSystemPreferenceSection: SystemPreferenceSection = "proxy";

export const systemPreferenceSectionMeta: Record<
  SystemPreferenceSection,
  { label: string; description: string }
> = {
  proxy: {
    label: "网络代理",
    description: "网页解析与远程下载",
  },
  performance: {
    label: "启动加速",
    description: "GPU / 稳定渲染模式",
  },
  modules: {
    label: "模块管理",
    description: "功能开关与视频运行时",
  },
  startupGallery: {
    label: "启动图库",
    description: "启动页轮播图片",
  },
};

export function isSystemPreferenceSection(value: string): value is SystemPreferenceSection {
  return (systemPreferenceSections as readonly string[]).includes(value);
}
