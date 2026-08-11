/**
 * 胶囊（Capsule）配色 tone map —— 全项目胶囊样式的单一来源。
 *
 * 设计目标：消除 `border-capsule-{t}-border bg-capsule-{t} text-capsule-{t}-foreground`
 * 这类三元组在 30+ 处的重复手写，统一胶囊的视觉契约。所有字段均为字面量字符串，
 * 以确保 Tailwind JIT 能在构建期解析（禁止动态拼接类名）。
 *
 * 详见 docs/胶囊样式规范.md。
 */

/** 胶囊色系枚举。8 个胶囊色 + primary（用于当前态/强调态）。 */
export type CapsuleTone =
  | "sage"
  | "mist"
  | "clay"
  | "lavender"
  | "fog"
  | "rose"
  | "sand"
  | "stone"
  | "primary";

export type CapsuleToneClassNames = {
  /** 实心：边框 + 背景 + 文本（最常用，静态展示与默认态）。 */
  solid: string;
  /** 描边：边框 + 文本，无背景（用于可点击的描边胶囊，悬停时填充背景）。 */
  outline: string;
  /** 选中态：胶囊色 → panel 的水平渐变 + 抬升阴影（用于可替换词条菜单的选中项）。 */
  selected: string;
  /** 圆点指示符背景：`[&>span:first-child]:bg-capsule-{t}-foreground`。 */
  indicatorBg: string;
  /** 推荐卡片 article 描边（边框 + 同色 hover 边框）。 */
  borderHover: string;
  /** 推荐卡片 button 描边（描边 + 悬停填充胶囊背景）。 */
  buttonOutline: string;
  /** 推荐卡片 icon 容器（描边 + panel/80 背景 + 胶囊文本色）。 */
  iconTone: string;
};

/** 胶囊 tone → 类名集合的唯一来源。新增胶囊色时在此处与 tokens.css 同步追加。 */
export const CAPSULE_TONES: Record<CapsuleTone, CapsuleToneClassNames> = {
  sage: {
    solid: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
    outline: "border-capsule-sage-border text-capsule-sage-foreground",
    selected:
      "border-capsule-sage-border bg-[linear-gradient(90deg,var(--color-capsule-sage),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-sage-foreground",
    borderHover: "border-capsule-sage-border hover:border-capsule-sage-border",
    buttonOutline: "border-capsule-sage-border text-capsule-sage-foreground hover:bg-capsule-sage",
    iconTone: "border-capsule-sage-border bg-panel/80 text-capsule-sage-foreground",
  },
  mist: {
    solid: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
    outline: "border-capsule-mist-border text-capsule-mist-foreground",
    selected:
      "border-capsule-mist-border bg-[linear-gradient(90deg,var(--color-capsule-mist),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-mist-foreground",
    borderHover: "border-capsule-mist-border hover:border-capsule-mist-border",
    buttonOutline: "border-capsule-mist-border text-capsule-mist-foreground hover:bg-capsule-mist",
    iconTone: "border-capsule-mist-border bg-panel/80 text-capsule-mist-foreground",
  },
  clay: {
    solid: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
    outline: "border-capsule-clay-border text-capsule-clay-foreground",
    selected:
      "border-capsule-clay-border bg-[linear-gradient(90deg,var(--color-capsule-clay),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-clay-foreground",
    borderHover: "border-capsule-clay-border hover:border-capsule-clay-border",
    buttonOutline: "border-capsule-clay-border text-capsule-clay-foreground hover:bg-capsule-clay",
    iconTone: "border-capsule-clay-border bg-panel/80 text-capsule-clay-foreground",
  },
  lavender: {
    solid: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
    outline: "border-capsule-lavender-border text-capsule-lavender-foreground",
    selected:
      "border-capsule-lavender-border bg-[linear-gradient(90deg,var(--color-capsule-lavender),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-lavender-foreground",
    borderHover: "border-capsule-lavender-border hover:border-capsule-lavender-border",
    buttonOutline:
      "border-capsule-lavender-border text-capsule-lavender-foreground hover:bg-capsule-lavender",
    iconTone: "border-capsule-lavender-border bg-panel/80 text-capsule-lavender-foreground",
  },
  fog: {
    solid: "border-capsule-fog-border bg-capsule-fog text-capsule-fog-foreground",
    outline: "border-capsule-fog-border text-capsule-fog-foreground",
    selected:
      "border-capsule-fog-border bg-[linear-gradient(90deg,var(--color-capsule-fog),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-fog-foreground",
    borderHover: "border-capsule-fog-border hover:border-capsule-fog-border",
    buttonOutline: "border-capsule-fog-border text-capsule-fog-foreground hover:bg-capsule-fog",
    iconTone: "border-capsule-fog-border bg-panel/80 text-capsule-fog-foreground",
  },
  rose: {
    solid: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
    outline: "border-capsule-rose-border text-capsule-rose-foreground",
    selected:
      "border-capsule-rose-border bg-[linear-gradient(90deg,var(--color-capsule-rose),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-rose-foreground",
    borderHover: "border-capsule-rose-border hover:border-capsule-rose-border",
    buttonOutline: "border-capsule-rose-border text-capsule-rose-foreground hover:bg-capsule-rose",
    iconTone: "border-capsule-rose-border bg-panel/80 text-capsule-rose-foreground",
  },
  sand: {
    solid: "border-capsule-sand-border bg-capsule-sand text-capsule-sand-foreground",
    outline: "border-capsule-sand-border text-capsule-sand-foreground",
    selected:
      "border-capsule-sand-border bg-[linear-gradient(90deg,var(--color-capsule-sand),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-sand-foreground",
    borderHover: "border-capsule-sand-border hover:border-capsule-sand-border",
    buttonOutline: "border-capsule-sand-border text-capsule-sand-foreground hover:bg-capsule-sand",
    iconTone: "border-capsule-sand-border bg-panel/80 text-capsule-sand-foreground",
  },
  stone: {
    solid: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    outline: "border-capsule-stone-border text-capsule-stone-foreground",
    selected:
      "border-capsule-stone-border bg-[linear-gradient(90deg,var(--color-capsule-stone),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-capsule-stone-foreground",
    borderHover: "border-capsule-stone-border hover:border-capsule-stone-border",
    buttonOutline: "border-capsule-stone-border text-capsule-stone-foreground hover:bg-capsule-stone",
    iconTone: "border-capsule-stone-border bg-panel/80 text-capsule-stone-foreground",
  },
  // primary 用于"当前值/强调态"，与 8 个胶囊色区分；色值取自推荐卡片当前态。
  primary: {
    solid: "border-primary/25 bg-primary-soft text-primary",
    outline: "border-primary/35 text-primary",
    selected:
      "border-primary/25 bg-[linear-gradient(90deg,var(--color-primary-soft),var(--color-panel))] text-foreground shadow-elevated",
    indicatorBg: "[&>span:first-child]:bg-primary",
    borderHover: "border-primary/30 hover:border-primary/45",
    buttonOutline: "border-primary/35 text-primary hover:bg-primary-soft",
    iconTone: "border-primary/30 bg-panel/80 text-primary",
  },
};

export type CapsuleToneVariant = keyof CapsuleToneClassNames;

/**
 * 按 tone + variant 取类名。未命中时回退到 `solid`，确保任何 tone 都有可用样式。
 */
export function getCapsuleToneClassName(
  tone: CapsuleTone,
  variant: CapsuleToneVariant = "solid",
): string {
  const classNames = CAPSULE_TONES[tone];
  return classNames[variant] ?? classNames.solid;
}
