import {
  getPromptSectionKeyByVariable,
  promptSectionMeta,
  resolvePromptSectionKeyForValue,
  type PromptSplitSectionKey,
} from "./promptSplit";

/**
 * Stable schema for prompt parameter capsules.
 *
 * This is intentionally separate from category and tag metadata. A remote or
 * legacy payload may provide a label/variable, but it can never create a new
 * parameter dimension: the canonical key, label and variable always come from
 * this schema (which is backed by promptSectionMeta).
 */
export type PromptParameterDefinition = {
  key: PromptSplitSectionKey;
  variable: string;
  label: string;
  group: "core" | "style" | "scene" | "product" | "portrait" | "costume" | "text";
};

export type ResolvePromptParameterInput = {
  key?: string | null;
  variable?: string | null;
  value?: string | null;
};

const reservedPromptMetadataVariables = new Set([
  "category",
  "categoryid",
  "categories",
  "genre",
  "genres",
  "genreid",
  "genreids",
  "tag",
  "tags",
  "primarycategory",
  "suggestedcategory",
  "suggestedcategories",
  "suggestedtag",
  "suggestedtags",
]);

export function normalizePromptParameterVariable(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").trim().toLocaleLowerCase("en-US");
}

export function isReservedPromptMetadataVariable(variable: string | null | undefined): boolean {
  return reservedPromptMetadataVariables.has(normalizePromptParameterVariable(variable));
}

export function resolvePromptParameterGroup(key: PromptSplitSectionKey): PromptParameterDefinition["group"] {
  if (key.startsWith("style_")) {
    return "style";
  }
  if (key.startsWith("scene_")) {
    return "scene";
  }
  if (key.startsWith("product_")) {
    return "product";
  }
  if (key.startsWith("portrait_")) {
    return "portrait";
  }
  if (key.startsWith("costume_")) {
    return "costume";
  }
  if (key.startsWith("text_")) {
    return "text";
  }
  return "core";
}

export function getPromptParameterDefinition(key: string | null | undefined): PromptParameterDefinition | null {
  const normalizedKey = (key ?? "").trim() as PromptSplitSectionKey;
  const meta = promptSectionMeta[normalizedKey];

  if (!meta || normalizedKey === "negative" || normalizedKey === "other") {
    return null;
  }

  return {
    key: normalizedKey,
    variable: meta.variable,
    label: meta.label,
    group: resolvePromptParameterGroup(normalizedKey),
  };
}

/**
 * Resolve an untrusted key/variable to the stable parameter schema.
 *
 * A valid section key wins over a mismatched variable for compatibility with
 * old remote payloads. Value-based recovery is deliberately allowed only for
 * non-reserved variables; values from category/tag metadata must not become
 * capsules by accident.
 */
export function resolvePromptParameterDefinition(
  input: ResolvePromptParameterInput,
): PromptParameterDefinition | null {
  const directKey = getPromptParameterDefinition(input.key);
  if (directKey) {
    return directKey;
  }

  if (isReservedPromptMetadataVariable(input.variable)) {
    return null;
  }

  const variable = input.variable?.trim() ?? "";
  const variableKey = getPromptSectionKeyByVariable(variable);
  const byVariable = getPromptParameterDefinition(variableKey);
  if (byVariable) {
    return byVariable;
  }

  const value = input.value?.trim() ?? "";
  if (!variable || !value) {
    return null;
  }

  const byValue = resolvePromptSectionKeyForValue(variable, value);
  return getPromptParameterDefinition(byValue);
}
