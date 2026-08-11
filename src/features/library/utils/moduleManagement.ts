import {
  builtinModuleDefinitions,
  canDisableBuiltinModule,
  isBuiltinModuleEnabled,
  isBuiltinModuleInstalled,
  type BuiltinModuleCategory,
  type BuiltinModuleDefinition,
  type BuiltinModuleId,
  type BuiltinModuleState,
} from "./moduleRegistry";

export const moduleCategoryOrder: readonly BuiltinModuleCategory[] = [
  "core",
  "prompt",
  "runtime",
  "batch",
] as const;

export const moduleCategoryLabels: Record<BuiltinModuleCategory, string> = {
  core: "核心",
  prompt: "提示词",
  runtime: "运行时",
  batch: "批量工具",
};

export type ModuleManagementRow = {
  definition: BuiltinModuleDefinition;
  /** 持久化 installed 标志（required 恒为 true）。 */
  installed: boolean;
  /** 原始 enabled 标志（未考虑依赖）。 */
  rawEnabled: boolean;
  /** 依赖级联后的有效可用状态。 */
  effectivelyEnabled: boolean;
  canDisable: boolean;
  /** 可切换启用：已安装且非必需。 */
  canToggleEnabled: boolean;
  /** 依赖未满足导致自身 enabled 无效。 */
  blockedByDependencies: boolean;
  dependencyLabels: string[];
};

/**
 * 将注册表 + 当前 moduleState 展开为面板行，供 UI 与单测共用。
 */
export function buildModuleManagementRows(state: BuiltinModuleState): ModuleManagementRow[] {
  return builtinModuleDefinitions.map((definition) => {
    const installed = isBuiltinModuleInstalled(definition.id, state);
    const rawEnabled = definition.required ? true : state[definition.id]?.enabled === true;
    const effectivelyEnabled = isBuiltinModuleEnabled(definition.id, state);
    const canDisable = canDisableBuiltinModule(definition.id);
    const dependencyLabels = definition.dependencies
      .map((dependencyId) => builtinModuleDefinitions.find((entry) => entry.id === dependencyId)?.label)
      .filter((label): label is string => Boolean(label));

    return {
      definition,
      installed,
      rawEnabled,
      effectivelyEnabled,
      canDisable,
      canToggleEnabled: canDisable && installed,
      blockedByDependencies: installed && rawEnabled && !effectivelyEnabled,
      dependencyLabels,
    };
  });
}

export function groupModuleManagementRows(
  rows: readonly ModuleManagementRow[],
): Array<{ category: BuiltinModuleCategory; label: string; rows: ModuleManagementRow[] }> {
  return moduleCategoryOrder
    .map((category) => ({
      category,
      label: moduleCategoryLabels[category],
      rows: rows.filter((row) => row.definition.category === category),
    }))
    .filter((group) => group.rows.length > 0);
}

/** video-runtime 探测结果如何写回 moduleState：保留用户在已安装时的 enabled 偏好。 */
export function resolveVideoRuntimeStateAfterProbe(
  current: { installed: boolean; enabled: boolean },
  installed: boolean,
): { installed: boolean; enabled: boolean } {
  if (!installed) {
    return { installed: false, enabled: false };
  }

  // 新检测到二进制（此前未装）→ 默认启用；已装则保留用户开关。
  if (!current.installed) {
    return { installed: true, enabled: true };
  }

  return { installed: true, enabled: current.enabled };
}

export function isVideoRuntimeModule(moduleId: BuiltinModuleId): boolean {
  return moduleId === "video-runtime";
}
