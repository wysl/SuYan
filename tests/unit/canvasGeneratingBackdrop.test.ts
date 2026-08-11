import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvasSource = readFileSync("src/features/library/components/CanvasView.tsx", "utf8");
const tokenSource = readFileSync("src/styles/tokens.css", "utf8");

describe("CanvasView generating backdrop", () => {
  it("renders decorative ambient, dot, prism, and shine layers behind the status card", () => {
    const stage = canvasSource.match(/function CanvasMotionBackdrop[\s\S]*?function CanvasResultStage/)?.[0] ?? "";

    expect(stage).toContain('className="canvas-ambient-glow"');
    expect(stage).toContain('className="canvas-dot-field"');
    expect(stage).toContain('className="canvas-prism-sweep"');
    expect(stage).toContain('className="canvas-glass-shine"');
    expect(stage.indexOf("canvas-dot-field")).toBeLessThan(stage.indexOf("canvas-status-card"));
  });

  it("reuses the motion backdrop for generated results instead of a gray fill", () => {
    const resultStage = canvasSource.match(/function CanvasResultStage[\s\S]*?function CanvasResultCard/)?.[0] ?? "";
    const resultCard = canvasSource.match(/function CanvasResultCard[\s\S]*?function ResultHoverButton/)?.[0] ?? "";

    expect(resultStage).toContain("CanvasMotionBackdrop blurPreviewSrc={active.dataUrl}");
    expect(resultCard).toContain('className="relative flex min-h-0 flex-1 items-center justify-center bg-transparent"');
    expect(resultCard).toContain("bg-transparent transition");
  });

  it("randomizes the initial phase of every roaming light layer per generating session", () => {
    expect(canvasSource).toContain("function randomPhaseDelay(periodSeconds: number)");
    expect(canvasSource).toContain('"--canvas-ambient-delay": randomPhaseDelay(28)');
    expect(canvasSource).toContain('"--canvas-breathe-delay": randomPhaseDelay(21)');
    expect(canvasSource).toContain('"--canvas-dot-delay": randomPhaseDelay(42)');
    expect(canvasSource).toContain('"--canvas-prism-delay": randomPhaseDelay(19)');
    expect(canvasSource).toContain('"--canvas-aurora-delay": randomPhaseDelay(37)');
    expect(canvasSource).toContain('"--canvas-flare-delay": randomPhaseDelay(29)');
    expect(canvasSource).toContain("style={motionStyle}");
  });

  it("derives eight ambient colors from existing light and dark theme tokens", () => {
    const glassBlock = tokenSource.match(/\.canvas-glass\s*\{[\s\S]*?\n}/)?.[0] ?? "";

    expect(glassBlock).toContain("--canvas-ambient-sage");
    expect(glassBlock).toContain("var(--color-capsule-sage-foreground)");
    expect(glassBlock).toContain("var(--color-capsule-mist-foreground)");
    expect(glassBlock).toContain("var(--color-capsule-clay-foreground)");
    expect(glassBlock).toContain("var(--color-capsule-lavender-foreground)");
    expect(glassBlock).toContain("var(--color-capsule-rose-foreground)");
    expect(glassBlock).toContain("var(--color-capsule-sand-foreground)");
    expect(glassBlock).toContain("--canvas-ambient-aqua");
    expect(glassBlock).toContain("--canvas-ambient-coral");
  });

  it("uses independently phased slow motion and stops every decorative layer for reduced motion", () => {
    expect(tokenSource).toContain("@keyframes canvas-ambient-drift");
    expect(tokenSource).toContain("@keyframes canvas-ambient-breathe");
    expect(tokenSource).toContain("@keyframes canvas-dot-drift");
    expect(tokenSource).toContain("@keyframes canvas-prism-wander");
    expect(tokenSource).toContain("@keyframes canvas-aurora-orbit");
    expect(tokenSource).toContain("@keyframes canvas-flare-wander");
    expect(tokenSource).toContain("animation: canvas-ambient-drift 28s");
    expect(tokenSource).toContain("animation: canvas-dot-drift 42s");
    expect(tokenSource).toContain("animation: canvas-prism-wander 19s");
    expect(tokenSource).toContain("animation: canvas-aurora-orbit 37s");
    expect(tokenSource).toContain("animation: canvas-flare-wander 29s");

    const prismStart = tokenSource.indexOf("@keyframes canvas-prism-wander");
    const prismEnd = tokenSource.indexOf("@keyframes canvas-aurora-orbit", prismStart);
    const prismKeyframes = tokenSource.slice(prismStart, prismEnd);
    expect(prismKeyframes).not.toContain("background-position:");
    expect(prismKeyframes.match(/translate3d\(/g)?.length).toBeGreaterThanOrEqual(5);

    const reducedMotionStart = tokenSource.indexOf("@media (prefers-reduced-motion: reduce)");
    const reducedMotionBlock = tokenSource.slice(reducedMotionStart, reducedMotionStart + 1800);
    expect(reducedMotionBlock).toContain(".canvas-ambient-glow");
    expect(reducedMotionBlock).toContain(".canvas-ambient-glow::before");
    expect(reducedMotionBlock).toContain(".canvas-dot-field");
    expect(reducedMotionBlock).toContain(".canvas-prism-sweep");
    expect(reducedMotionBlock).toContain(".canvas-glass-shine");
    expect(reducedMotionBlock).toContain(".canvas-glass-shine::before");
    expect(reducedMotionBlock).toContain(".canvas-glass-shine::after");
    expect(reducedMotionBlock).toContain("animation: none !important");
  });
});
