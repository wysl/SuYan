import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CAPSULE_TONES, type CapsuleTone, type CapsuleToneVariant } from "./capsuleTones";

/**
 * 胶囊（Capsule）规范组件 —— 全项目胶囊视觉的统一实现。
 *
 * 形态契约：
 * - `shape="pill"`（默认）：`rounded-full`，用于提示词参数胶囊、加载占位等"真胶囊"。
 * - `shape="rounded"`：`rounded-md`，用于标签/分类徽标等圆角徽章。
 *
 * 尺寸契约：
 * - `size="sm"`（默认）：`px-2 py-0.5 text-[11px] font-semibold leading-5`，匹配提示词参数胶囊。
 * - `size="md"`：`px-2 py-1 text-xs`，匹配标签/分类徽标。
 *
 * 配色契约：tone 来自 `CAPSULE_TONES`（单一来源），variant 控制实心/描边/选中态。
 *
 * 交互契约：`as="button"` 时启用 hover/focus/disabled 反馈；`as="span"`（默认）为静态展示。
 *
 * 详见 docs/胶囊样式规范.md。
 */
export type CapsuleShape = "pill" | "rounded";
export type CapsuleSize = "sm" | "md";
export type CapsuleVariant = "solid" | "outline" | "selected";

type CapsuleOwnProps = {
  tone?: CapsuleTone;
  variant?: CapsuleVariant;
  size?: CapsuleSize;
  shape?: CapsuleShape;
  /** 渲染为按钮（启用交互反馈）或 span（静态展示）。 */
  as?: "span" | "button";
  /** 文本最大宽度，超出截断并显示省略号。默认 "14rem"，传 false 关闭。 */
  maxWidth?: string | false;
  /** 是否显示前导圆点指示符（使用 tone 前景色）。 */
  indicator?: boolean;
  /** 指定 tone variant（覆盖 variant 的默认映射，用于复用 selected/indicatorBg 等）。 */
  toneVariant?: CapsuleToneVariant;
  className?: string;
  children?: ReactNode;
};

export type CapsuleProps = CapsuleOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

const sizeClassNames: Record<CapsuleSize, string> = {
  sm: "px-2 py-0.5 text-[11px] font-semibold leading-5",
  md: "px-2 py-1 text-xs",
};

const shapeClassNames: Record<CapsuleShape, string> = {
  pill: "rounded-full",
  rounded: "rounded-md",
};

function resolveToneClass(
  tone: CapsuleTone,
  variant: CapsuleVariant,
  interactive: boolean,
  toneVariant?: CapsuleToneVariant,
): string {
  if (toneVariant) {
    return CAPSULE_TONES[tone][toneVariant];
  }
  if (variant === "solid") {
    return CAPSULE_TONES[tone].solid;
  }
  if (variant === "selected") {
    return CAPSULE_TONES[tone].selected;
  }
  // outline：交互态使用带悬停填充的 buttonOutline，静态态使用纯描边。
  return interactive ? CAPSULE_TONES[tone].buttonOutline : CAPSULE_TONES[tone].outline;
}

export function Capsule({
  tone = "stone",
  variant = "solid",
  size = "sm",
  shape = "pill",
  as = "span",
  maxWidth = "14rem",
  indicator = false,
  toneVariant,
  className = "",
  children,
  title,
  ...props
}: CapsuleProps) {
  const interactive = as === "button";
  const toneClass = resolveToneClass(tone, variant, interactive, toneVariant);
  const textTitle = typeof children === "string" ? children : undefined;
  const resolvedTitle = title ?? textTitle;

  const baseClassName = "inline-flex min-h-0 max-w-full items-center gap-1 border font-sans";
  const interactiveClassName = interactive
    ? "shadow-elevated transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
    : "";
  const composedClassName = [
    baseClassName,
    sizeClassNames[size],
    shapeClassNames[shape],
    toneClass,
    interactiveClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const style = maxWidth ? { maxWidth } : undefined;
  const indicatorNode = indicator ? (
    <span aria-hidden="true" className={CAPSULE_TONES[tone].indicatorBg} />
  ) : null;
  const labelNode = children ? (
    <span className={maxWidth ? "min-w-0 truncate" : ""}>{children}</span>
  ) : null;

  if (as === "button") {
    return (
      <button className={composedClassName} style={style} title={resolvedTitle} type="button" {...props}>
        {indicatorNode}
        {labelNode}
      </button>
    );
  }

  return (
    <span className={composedClassName} style={style} title={resolvedTitle} {...(props as Record<string, unknown>)}>
      {indicatorNode}
      {labelNode}
    </span>
  );
}
