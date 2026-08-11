import { describe, expect, it } from "vitest";
import {
  collapseTagsIntoMainAndFunRecipe,
  collectUsedTagKeysFromItems,
  funRecipeTagGroupLabel,
  normalizeImageTag,
  normalizeImageTagList,
  pruneOrphanTagLexiconEntries,
} from "../../src/features/library/utils/tagNormalization";

describe("tagNormalization", () => {
  it("merges synonyms and drops stop words", () => {
    expect(normalizeImageTag("界面")).toBe("UI界面");
    expect(normalizeImageTag("电商主图")).toBe("电商主图");
    expect(normalizeImageTag("全部")).toBeNull();
    expect(normalizeImageTagList(["#柔光", "软光", "柔光", "全部"])).toEqual(["柔光"]);
  });

  it("prunes orphan lexicon entries", () => {
    const used = collectUsedTagKeysFromItems([{ tags: ["柔光", "香水"] }]);
    const pruned = pruneOrphanTagLexiconEntries(
      [
        { id: "1", group: "光影 Lighting", label: "柔光" },
        { id: "2", group: "主体 Subject", label: "香水" },
        { id: "3", group: "风格 Style", label: "已删除标签" },
      ],
      used,
    );
    expect(pruned.removedCount).toBe(1);
    expect(pruned.entries.map((entry) => entry.label)).toEqual(["柔光", "香水"]);
  });

  it("keeps explicit custom tags before they are assigned to a material", () => {
    const used = collectUsedTagKeysFromItems([{ tags: ["香水"] }]);
    const pruned = pruneOrphanTagLexiconEntries(
      [
        { id: "custom-tag-1", group: "主体 Subject", label: "待使用标签" },
        { id: "derived-tag-2", group: "光影 Lighting", label: "已删除标签" },
        { id: "tag-3", group: "主体 Subject", label: "另一条派生标签" },
        { id: "tag-4", group: "主体 Subject", label: "香水" },
      ],
      used,
    );

    expect(pruned.entries.map((entry) => entry.label)).toEqual(["待使用标签", "香水"]);
    expect(pruned.removedCount).toBe(2);
  });

  it("collapses long-tail tags into fun recipe group", () => {
    const used = new Set(["柔光", "这是一个很长很长的描述型标签"]);
    const collapsed = collapseTagsIntoMainAndFunRecipe(
      [
        { id: "1", group: "光影 Lighting", label: "柔光" },
        { id: "2", group: "通用标签", label: "这是一个很长很长的描述型标签" },
      ],
      used,
    );
    expect(collapsed.find((entry) => entry.label === "柔光")?.group).toBe("光影 Lighting");
    expect(collapsed.find((entry) => entry.label.includes("很长"))?.group).toBe(funRecipeTagGroupLabel);
  });

  it("splits color-prefixed hair compounds down to the bare hair noun", () => {
    // 发色是可分离属性（交色彩体系），发型核心名词才是妆发特征词，故剥掉颜色前缀。
    expect(normalizeImageTag("粉色短发")).toBe("短发");
    expect(normalizeImageTag("黑色长发")).toBe("长发");
    expect(normalizeImageTag("亚麻色卷发")).toBe("卷发");
    expect(normalizeImageTag("浅棕色披肩发")).toBe("披肩发");
    // 剖开后与已存在的纯发型标签去重，不再重复。
    expect(normalizeImageTagList(["粉色短发", "短发"])).toEqual(["短发"]);
    // 颜色即主体特征（非发型）的词原样保留：白花/红唇；无颜色前缀的复合发型词也原样保留。
    expect(normalizeImageTag("白花")).toBe("白花");
    expect(normalizeImageTag("红唇")).toBe("红唇");
    expect(normalizeImageTag("大波浪卷发")).toBe("大波浪卷发");
    expect(normalizeImageTag("银色喷头")).toBe("银色喷头");
  });
});
