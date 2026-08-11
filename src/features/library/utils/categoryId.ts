/** Stable category id helpers. */

export function slugifyCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_./]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function buildSystemCategoryId(group: string, name: string): string {
  const groupSlug = slugifyCategoryName(group) || "group";
  const nameSlug = slugifyCategoryName(name) || "category";
  return `system:${groupSlug}:${nameSlug}`;
}

export function buildCustomCategoryId(name: string, seed?: string): string {
  const nameSlug = slugifyCategoryName(name) || "custom";
  const suffix = (seed || Math.random().toString(36).slice(2, 10)).toLowerCase();
  return `custom:${nameSlug}:${suffix}`;
}

export function buildAiCandidateCategoryId(name: string, seed?: string): string {
  const nameSlug = slugifyCategoryName(name) || "ai";
  const suffix = (seed || Math.random().toString(36).slice(2, 10)).toLowerCase();
  return `ai:${nameSlug}:${suffix}`;
}

export function normalizeCategoryLabelKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
