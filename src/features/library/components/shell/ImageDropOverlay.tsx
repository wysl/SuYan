import { Upload } from "lucide-react";

export function ImageDropOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-overlay/60 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-panel/95 px-10 py-8 text-center shadow-elevated">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Upload size={26} />
        </span>
        <p className="text-base font-semibold text-foreground">松开鼠标即可导入图片</p>
        <p className="text-sm text-muted">支持多张同时拖入</p>
        <ul className="mt-1 space-y-1 text-left text-xs leading-5 text-muted">
          <li>· 自动读取每张图内嵌提示词</li>
          <li>· 内容相同的提示词归为同一组</li>
          <li>· 不同提示词拆成不同提示词组</li>
        </ul>
      </div>
    </div>
  );
}
