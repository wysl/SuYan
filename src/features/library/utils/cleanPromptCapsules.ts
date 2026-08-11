/**
 * 胶囊模板清洗：把提示词里的 `{{variable: value}}` 胶囊还原为纯文本。
 *
 * 从原 promptSplit 的 resolvePromptTemplateText 抽出，独立无依赖，
 * 用于删除参数机制后对存量/展示提示词的胶囊标记清洗。
 * - `{{key: value}}` → value（取冒号后的值）
 * - `{{value}}` → value（裸胶囊取内部文本）
 */
export function stripPromptCapsules(text: string): string {
  return text
    .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, (_match, _key: string, value: string) => value.trim())
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => key.trim());
}