import { describe, expect, it } from "vitest";
import {
  analysisDimensionGroups,
  getHomePhotographyCategorySet,
  homePhotographyCategoryLabels,
  dedupeExclusiveGenreLabels,
  evaluateGenreAdmission,
  evaluateTagAdmission,
  isPseudoPhotographyGenreLabel,
  isHiddenAiCategoryLabel,
  normalizeAiCategorySuggestions,
  normalizePhotographyCategorySuggestions,
  photographyCategoryDefinitions,
  photographyCategoryGroupLabels,
  photographyCategoryLabels,
  resolveLabelLayer,
  resolvePhotographyCategory,
  tagLayerVocabulary,
} from "../../src/features/library/utils/photographyCategories";
import { sanitizePromptTags } from "../../src/features/library/utils/promptAnalysis";
import { getPromptTagGroup } from "../../src/features/library/utils/promptLexicons";

describe("photographyCategories", () => {
  it("keeps every leaf name unique across the whole ontology", () => {
    // 重名叶子会让 resolveCategoryIdFromLegacyName / normalizedCategoryMap 指向错误分组，
    // 表现为「选了 A 维度却落到 B 维度」。新增维度组时必须先过这一关。
    const duplicates = photographyCategoryLabels.filter(
      (label, index) => photographyCategoryLabels.indexOf(label) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("resolves every leaf name to itself, never to a legacy alias", () => {
    // 别名表里有「长曝光 → 长曝光摄影」，而「长曝光」现在是技术手法维度的叶子。
    // 叶子必须赢过别名，否则该维度永远选不中。
    for (const label of photographyCategoryLabels) {
      expect(resolvePhotographyCategory(label)).toBe(label);
    }
  });

  it("exposes the orthogonal analysis dimensions as their own groups", () => {
    for (const group of analysisDimensionGroups) {
      expect(photographyCategoryGroupLabels).toContain(group);
      expect(photographyCategoryDefinitions.some((item) => item.group === group)).toBe(true);
    }
    expect(resolvePhotographyCategory("长曝光")).toBe("长曝光");
    expect(resolvePhotographyCategory("浅景深")).toBe("浅景深");
  });

  it("removes visual properties from AI category suggestions", () => {
    expect(normalizeAiCategorySuggestions([
      "肖像摄影",
      "专业影棚",
      "柔光",
      "棚拍光",
      "浪漫唯美",
      "浅景深",
      "红色主导",
      "汉服造型",
      "中式国风",
    ])).toEqual(["肖像摄影", "专业影棚", "汉服造型", "中式国风"]);

    for (const label of ["柔光", "棚拍光", "浪漫唯美", "浅景深", "红色主导"]) {
      expect(isHiddenAiCategoryLabel(label)).toBe(true);
    }
  });

  it("keeps scene common-nouns in the tag layer", () => {
    // 场景细分叶子用双字复合名，其单字通名留给标签层描述画面事实。
    // 若给它们加了指向分类的别名，sanitizePromptTags 会把这些标签整片剥掉。
    for (const label of ["草地", "绿叶", "水面", "蓝天", "白云"]) {
      expect(photographyCategoryLabels).not.toContain(label);
      expect(evaluateTagAdmission(label).admitted).toBe(true);
    }
    // 复合名本身仍是分类
    expect(resolvePhotographyCategory("草地原野")).toBe("草地原野");
    expect(resolvePhotographyCategory("天空云海")).toBe("天空云海");
    expect(resolvePhotographyCategory("天空")).toBe("天空云海");
  });

  it("excludes framing / composition / camera angle from both categories and tags", () => {
    // 产品决策：景别 / 构图 / 机位是画面执行细节，两层都排除。
    for (const label of ["近景", "特写", "全景", "俯拍", "仰拍", "低角度", "三分构图", "中心构图", "对称构图", "留白"]) {
      expect(photographyCategoryLabels).not.toContain(label);
      expect(evaluateTagAdmission(label).admitted).toBe(false);
      expect(evaluateGenreAdmission(label).admitted).toBe(false);
    }
    // 景距词（近景/中景/远景/全景）含复合形式一并排除。
    expect(evaluateTagAdmission("近景人像").admitted).toBe(false);
    expect(evaluateTagAdmission("全景环境").admitted).toBe(false);
    // 「半身」保持精确匹配，不误伤服饰「半身裙」。
    expect(evaluateTagAdmission("半身裙").admitted).toBe(true);
  });

  it("never lets a label belong to both 分类 and 标签", () => {
    // 边界的两个方向都要闭合，否则同一个词会在分类和标签里各出现一次。
    // 方向一：每个分类叶子都不得被写进标签。
    for (const label of photographyCategoryLabels) {
      expect(resolveLabelLayer(label)).toBe("category");
      expect(evaluateTagAdmission(label).admitted).toBe(false);
    }

    // 方向二：每个标签层词都不得升格为分类。
    for (const label of tagLayerVocabulary) {
      expect(resolveLabelLayer(label)).toBe("tag");
      expect(evaluateGenreAdmission(label).admitted).toBe(false);
      expect(evaluateTagAdmission(label).admitted).toBe(true);
    }
  });

  it("pins bare style/mood/color words to their category dimension", () => {
    // 「宁静」和「宁静平和」必须是同一个东西，否则一个进标签一个进分类。
    expect(resolvePhotographyCategory("宁静")).toBe("宁静平和");
    expect(resolvePhotographyCategory("温暖")).toBe("温馨治愈");
    expect(resolvePhotographyCategory("孤独")).toBe("孤独疏离");
    expect(resolvePhotographyCategory("极简")).toBe("极简主义");
    expect(resolvePhotographyCategory("港风")).toBe("港风复古");
    expect(resolvePhotographyCategory("黑白")).toBe("黑白灰调");
    expect(evaluateTagAdmission("宁静").admitted).toBe(false);
    expect(evaluateTagAdmission("极简").admitted).toBe(false);
  });

  it("classifies who is photographed and what they wear", () => {
    expect(photographyCategoryLabels).toContain("少女写真");
    expect(photographyCategoryLabels).toContain("汉服造型");
    expect(resolvePhotographyCategory("少女")).toBe("少女写真");
    expect(resolvePhotographyCategory("汉服")).toBe("汉服造型");
    expect(resolvePhotographyCategory("JK")).toBe("JK制服");
    expect(resolvePhotographyCategory("全家福")).toBe("家庭合影");
    expect(resolvePhotographyCategory("孕妇写真")).toBe("孕期写真");
    // 人物题材与服饰造型是两个正交维度，可以同时出现
    expect(dedupeExclusiveGenreLabels(["少女写真", "汉服造型"])).toEqual(["少女写真", "汉服造型"]);
    // 各自维度内仍是单选
    expect(dedupeExclusiveGenreLabels(["少女写真", "情侣写真"])).toEqual(["少女写真"]);
    expect(dedupeExclusiveGenreLabels(["汉服造型", "旗袍造型"])).toEqual(["汉服造型"]);
  });

  it("refines 时代风格 into dynasties from 先秦 to 清 without overlap", () => {
    // 朝代作为「时代风格」单选维度的叶子，先秦→清全覆盖，各自解析到自身。
    for (const dynasty of ["先秦风", "秦汉风", "魏晋风", "隋唐风", "宋代风", "明代风", "清代风"]) {
      expect(photographyCategoryLabels).toContain(dynasty);
      expect(resolvePhotographyCategory(dynasty)).toBe(dynasty);
    }
    // 常见别名归位到对应朝代（具体朝代赢过「中国古代」兜底）。
    expect(resolvePhotographyCategory("汉制")).toBe("秦汉风");
    expect(resolvePhotographyCategory("唐制")).toBe("隋唐风");
    expect(resolvePhotographyCategory("宋制")).toBe("宋代风");
    expect(resolvePhotographyCategory("明制")).toBe("明代风");
    expect(resolvePhotographyCategory("清宫风")).toBe("清代风");
    // 朝代不明或跨代混搭仍走兜底伞叶「中国古代」。
    expect(resolvePhotographyCategory("古风")).toBe("中国古代");
    expect(resolvePhotographyCategory("汉唐风")).toBe("中国古代");
    // 时代风格单选：一张图只归一个主朝代，中国古代与朝代叶子互斥。
    expect(dedupeExclusiveGenreLabels(["隋唐风", "宋代风"])).toEqual(["隋唐风"]);
    expect(dedupeExclusiveGenreLabels(["中国古代", "明代风"])).toEqual(["中国古代"]);
    // 朝代（时代维度）与服饰造型正交，两维可共存，构成「古风写真」的多维交叉。
    expect(dedupeExclusiveGenreLabels(["隋唐风", "汉服造型"])).toEqual(["隋唐风", "汉服造型"]);
  });

  it("routes historical garments to the tag layer and exposes the 古风 nav", () => {
    // 具体服制是画面事实，属标签层，不得升格为分类。
    for (const garment of ["曲裾", "襦裙", "圆领袍", "褙子", "马面裙", "氅衣", "曳撒"]) {
      expect(photographyCategoryLabels).not.toContain(garment);
      expect(resolveLabelLayer(garment)).toBe("tag");
      expect(evaluateGenreAdmission(garment).admitted).toBe(false);
      expect(evaluateTagAdmission(garment).admitted).toBe(true);
    }
    // 马面裙 不再解析为分类别名（曾 → 汉服造型），因而能作为标签在 sanitize 后留存。
    expect(resolvePhotographyCategory("马面裙")).toBeNull();
    expect(resolvePhotographyCategory("汉服")).toBe("汉服造型");
    expect(sanitizePromptTags(["马面裙", "圆领袍"])).toEqual(
      expect.arrayContaining(["马面裙", "圆领袍"]),
    );
    // 首页「古风」聚合导航跨维度命中朝代与服饰；「年代」导航纳入新朝代叶子。
    expect(getHomePhotographyCategorySet("古风")?.has("隋唐风")).toBe(true);
    expect(getHomePhotographyCategorySet("古风")?.has("汉服造型")).toBe(true);
    expect(getHomePhotographyCategorySet("年代")?.has("明代风")).toBe(true);
  });

  it("routes colloquial scenery words to the 风光/城市风光 leaves", () => {
    expect(resolvePhotographyCategory("景观")).toBe("风光摄影");
    expect(resolvePhotographyCategory("田园风光")).toBe("风光摄影");
    expect(resolvePhotographyCategory("田园")).toBe("风光摄影");
    expect(resolvePhotographyCategory("牧场")).toBe("风光摄影");
    expect(resolvePhotographyCategory("乡村")).toBe("风光摄影");
    expect(resolvePhotographyCategory("城市景观")).toBe("城市风光摄影");
    expect(resolvePhotographyCategory("天际线")).toBe("城市风光摄影");
    // 既有精确别名不受影响：景观设计仍归建筑与空间视觉，不被裸词「景观」劫持。
    expect(resolvePhotographyCategory("景观设计")).toBe("景观设计图");
    expect(resolvePhotographyCategory("风景")).toBe("风光摄影");
  });

  it("adds Western art movements as 风格流派 leaves with alias mapping", () => {
    for (const movement of ["文艺复兴风", "巴洛克风", "洛可可风", "新古典主义", "浪漫主义", "表现主义", "立体主义"]) {
      expect(photographyCategoryLabels).toContain(movement);
      expect(resolvePhotographyCategory(movement)).toBe(movement);
    }
    // 学院派术语/画派名经别名归位到风格流派叶子。
    expect(resolvePhotographyCategory("巴洛克")).toBe("巴洛克风");
    expect(resolvePhotographyCategory("立体派")).toBe("立体主义");
    expect(resolvePhotographyCategory("后印象派")).toBe("印象派风");
    expect(resolvePhotographyCategory("佛罗伦萨画派")).toBe("文艺复兴风");
    expect(resolvePhotographyCategory("巴比松画派")).toBe("自然主义");
    // 风格流派可 2 选（题材调性 + 画面质感），新画派与既有质感风共存；超过 2 仍收敛。
    expect(dedupeExclusiveGenreLabels(["巴洛克风", "油画质感"])).toEqual(["巴洛克风", "油画质感"]);
    expect(dedupeExclusiveGenreLabels(["巴洛克风", "洛可可风", "立体主义"])).toEqual(["巴洛克风", "洛可可风"]);
  });

  it("adds trendy 少女写真 scenes and keeps it expressible across dimensions", () => {
    for (const scene of ["便利店", "游乐园"]) {
      expect(photographyCategoryLabels).toContain(scene);
      expect(resolvePhotographyCategory(scene)).toBe(scene);
    }
    expect(resolvePhotographyCategory("游乐场")).toBe("游乐园");
    expect(resolvePhotographyCategory("韩系甜美")).toBe("韩系简约");
    // 少女写真是人物题材叶子，与场景/风格/色彩正交，多维共存即完成精准分类。
    expect(
      dedupeExclusiveGenreLabels(["少女写真", "便利店", "日系清新", "马卡龙色"]),
    ).toEqual(["少女写真", "便利店", "日系清新", "马卡龙色"]);
  });

  it("routes person-temperament words to the 气质 tag layer", () => {
    for (const vibe of ["清纯", "甜酷", "御姐", "知性", "元气", "冷艳"]) {
      expect(photographyCategoryLabels).not.toContain(vibe);
      expect(resolveLabelLayer(vibe)).toBe("tag");
      expect(evaluateGenreAdmission(vibe).admitted).toBe(false);
      expect(evaluateTagAdmission(vibe).admitted).toBe(true);
      expect(resolvePhotographyCategory(vibe)).toBeNull();
    }
    // 气质词能作为标签在 sanitize 后留存。
    expect(sanitizePromptTags(["甜酷", "御姐"])).toEqual(
      expect.arrayContaining(["甜酷", "御姐"]),
    );
  });

  it("maps 私房写真 to existing tasteful leaves and adds the 浴室 scene", () => {
    expect(photographyCategoryLabels).toContain("浴室");
    expect(resolvePhotographyCategory("浴室")).toBe("浴室");
    expect(resolvePhotographyCategory("淋浴间")).toBe("浴室");
    // 私房写真归入既有「人物艺术摄影」；内衣走服饰造型；均不新建身体部位分类。
    expect(resolvePhotographyCategory("私房写真")).toBe("人物艺术摄影");
    expect(resolvePhotographyCategory("内衣")).toBe("内衣贴身");
    // 私房 = 人物艺术摄影 × 场景 × 光线 多维正交共存，无需复合叶子。
    expect(
      dedupeExclusiveGenreLabels(["人物艺术摄影", "浴室", "柔光"]),
    ).toEqual(["人物艺术摄影", "浴室", "柔光"]);
  });

  it("splits food into a 美食摄影 domain while keeping 食品摄影 as fallback", () => {
    for (const leaf of ["菜品摄影", "烘焙甜点摄影", "食材生鲜摄影", "烹饪过程摄影", "街头小吃摄影"]) {
      expect(photographyCategoryLabels).toContain(leaf);
      expect(resolvePhotographyCategory(leaf)).toBe(leaf);
    }
    // 子类别名重定向到具体叶子；广义词与菜系仍归兜底 食品摄影。
    expect(resolvePhotographyCategory("甜品")).toBe("烘焙甜点摄影");
    expect(resolvePhotographyCategory("烘焙摄影")).toBe("烘焙甜点摄影");
    expect(resolvePhotographyCategory("蔬果")).toBe("食材生鲜摄影");
    expect(resolvePhotographyCategory("小吃点心摄影")).toBe("街头小吃摄影");
    expect(resolvePhotographyCategory("菜品")).toBe("菜品摄影");
    expect(resolvePhotographyCategory("美食")).toBe("食品摄影");
    expect(resolvePhotographyCategory("日料")).toBe("食品摄影");
    expect(resolvePhotographyCategory("零食")).toBe("食品摄影");
    // 食品各题材互斥单选（含兜底），一图取主+近邻（默认 cap 3）。
    expect(
      dedupeExclusiveGenreLabels(["菜品摄影", "烘焙甜点摄影", "食材生鲜摄影", "烹饪过程摄影"]),
    ).toEqual(["菜品摄影", "烘焙甜点摄影", "食材生鲜摄影"]);
    // 具体菜品/节庆仍是「美食」标签，不升格为分类。
    expect(resolvePhotographyCategory("月饼")).toBeNull();
    expect(getPromptTagGroup("月饼")).toContain("美食");
    // 首页「美食」聚合导航。
    expect(getHomePhotographyCategorySet("美食")?.has("烘焙甜点摄影")).toBe(true);
  });

  it("splits high-value product verticals from the 产品摄影 fallback", () => {
    for (const leaf of ["电子数码摄影", "珠宝腕表摄影"]) {
      expect(photographyCategoryLabels).toContain(leaf);
      expect(resolvePhotographyCategory(leaf)).toBe(leaf);
    }
    expect(resolvePhotographyCategory("手机摄影")).toBe("电子数码摄影");
    expect(resolvePhotographyCategory("家电摄影")).toBe("电子数码摄影");
    expect(resolvePhotographyCategory("珠宝摄影")).toBe("珠宝腕表摄影");
    expect(resolvePhotographyCategory("手表摄影")).toBe("珠宝腕表摄影");
    // 通用商品 / 奢侈品仍归兜底 产品摄影。
    expect(resolvePhotographyCategory("商品")).toBe("产品摄影");
    expect(resolvePhotographyCategory("奢侈品摄影")).toBe("产品摄影");
    // 商业摄影域内互斥单选：产品/电子/珠宝取主+近邻（cap 3）。
    expect(
      dedupeExclusiveGenreLabels(["产品摄影", "电子数码摄影", "珠宝腕表摄影", "美妆摄影"]),
    ).toEqual(["产品摄影", "电子数码摄影", "珠宝腕表摄影"]);
  });

  it("routes landscape terrain words to scene/season dimensions, not new genre leaves", () => {
    // 地貌口语归「场景细分」维度，不新造风光子叶（避免与场景细分重叠）。
    expect(resolvePhotographyCategory("海岸")).toBe("海滨沙滩");
    expect(resolvePhotographyCategory("戈壁")).toBe("沙漠戈壁");
    expect(resolvePhotographyCategory("草原")).toBe("草地原野");
    expect(resolvePhotographyCategory("冰川")).toBe("雪原冰川");
    // 天候 / 季节归对应维度。
    expect(resolvePhotographyCategory("雾景")).toBe("雨雪天候");
    expect(resolvePhotographyCategory("秋色")).toBe("秋季");
    // 风光题材仍是单叶；地貌由场景细分承载，两维正交共存。
    expect(resolvePhotographyCategory("海景")).toBe("风光摄影");
    expect(
      dedupeExclusiveGenreLabels(["风光摄影", "海滨沙滩", "黄昏"]),
    ).toEqual(["风光摄影", "海滨沙滩", "黄昏"]);
  });

  it("splits pets into 犬类/猫类/异宠 leaves with 宠物摄影 fallback", () => {
    for (const leaf of ["犬类摄影", "猫类摄影", "异宠摄影"]) {
      expect(photographyCategoryLabels).toContain(leaf);
      expect(resolvePhotographyCategory(leaf)).toBe(leaf);
    }
    expect(resolvePhotographyCategory("狗狗")).toBe("犬类摄影");
    expect(resolvePhotographyCategory("猫咪")).toBe("猫类摄影");
    expect(resolvePhotographyCategory("仓鼠")).toBe("异宠摄影");
    expect(resolvePhotographyCategory("兔子")).toBe("异宠摄影");
    // 通用/混合宠物仍归兜底 宠物摄影。
    expect(resolvePhotographyCategory("宠物")).toBe("宠物摄影");
    expect(resolvePhotographyCategory("宠物肖像")).toBe("宠物摄影");
    // 宠物域内互斥单选（含兜底，cap 3）。
    expect(
      dedupeExclusiveGenreLabels(["宠物摄影", "犬类摄影", "猫类摄影", "异宠摄影"]),
    ).toEqual(["宠物摄影", "犬类摄影", "猫类摄影"]);
    // 人宠合影是人物题材维度，与宠物题材正交共存。
    expect(dedupeExclusiveGenreLabels(["犬类摄影", "宠物同框"])).toEqual(["犬类摄影", "宠物同框"]);
  });

  it("maps fashion/art subtypes onto existing genres without over-splitting", () => {
    // 时尚子类归 时尚摄影 题材（美容美妆已独立为 美妆摄影）。
    for (const label of ["高级定制", "高定", "街头时尚", "商业时尚", "配饰静物"]) {
      expect(resolvePhotographyCategory(label)).toBe("时尚摄影");
    }
    expect(resolvePhotographyCategory("美容美妆")).toBe("美妆摄影");
    // 艺术子类已是 艺术摄影域现成叶子 / 风格流派叶子。
    expect(resolvePhotographyCategory("观念摄影")).toBe("概念摄影");
    expect(resolvePhotographyCategory("实验性摄影")).toBe("实验摄影");
    expect(resolvePhotographyCategory("超现实摄影")).toBe("超现实摄影");
    expect(resolvePhotographyCategory("抽象摄影")).toBe("抽象摄影");
    expect(resolvePhotographyCategory("极简摄影")).toBe("极简主义");
    // 时尚的艺术化表达 = 时尚摄影(题材) × 超现实主义(风格)，两维正交共存。
    expect(dedupeExclusiveGenreLabels(["时尚摄影", "超现实主义"])).toEqual(["时尚摄影", "超现实主义"]);
  });

  it("maps documentary/humanist subtypes onto the 纪实 domain leaves", () => {
    expect(resolvePhotographyCategory("纪实摄影")).toBe("人文摄影");
    expect(resolvePhotographyCategory("社会纪实")).toBe("社会摄影");
    expect(resolvePhotographyCategory("民俗文化")).toBe("人文摄影");
    expect(resolvePhotographyCategory("旅行人文")).toBe("旅行摄影");
    expect(resolvePhotographyCategory("市井生活")).toBe("人文摄影");
    // 既有子叶与别名不受影响。
    expect(resolvePhotographyCategory("街头摄影")).toBe("街头摄影");
    expect(resolvePhotographyCategory("新闻纪实摄影")).toBe("新闻摄影");
    // 纪实域内单选收敛（cap 3）；跨域（如环境人像=肖像+风光）不受影响。
    expect(
      dedupeExclusiveGenreLabels(["街头摄影", "人文摄影", "社会摄影", "新闻摄影"]),
    ).toEqual(["街头摄影", "人文摄影", "社会摄影"]);
  });

  it("splits web page types from the 网页设计 fallback", () => {
    for (const leaf of ["落地页设计", "电商页面设计", "内容资讯页设计"]) {
      expect(photographyCategoryLabels).toContain(leaf);
      expect(resolvePhotographyCategory(leaf)).toBe(leaf);
    }
    expect(resolvePhotographyCategory("落地页")).toBe("落地页设计");
    expect(resolvePhotographyCategory("Landing Page")).toBe("落地页设计");
    expect(resolvePhotographyCategory("产品详情页")).toBe("电商页面设计");
    expect(resolvePhotographyCategory("帮助中心")).toBe("内容资讯页设计");
    // 通用网站/未知页面仍归兜底；电商视觉域的「详情页长图」不受影响。
    expect(resolvePhotographyCategory("网页UI")).toBe("网页设计");
    expect(resolvePhotographyCategory("详情页")).toBe("详情页长图");
    // 游戏语境的「登录页」仍归游戏主视觉；网页登录/注册用独立词形归网页设计兜底。
    expect(resolvePhotographyCategory("登录页")).toBe("游戏主视觉");
    expect(resolvePhotographyCategory("登录注册页")).toBe("网页设计");
    expect(resolvePhotographyCategory("搜索结果页")).toBe("网页设计");
    // UI 域内单选收敛（cap 3）。
    expect(
      dedupeExclusiveGenreLabels(["网页设计", "落地页设计", "电商页面设计", "内容资讯页设计"]),
    ).toEqual(["网页设计", "落地页设计", "电商页面设计"]);
  });

  it("routes UI components and micro-styles to the UI设计 tag layer", () => {
    for (const word of ["按钮", "弹窗", "导航栏", "新拟物", "玻璃态", "瀑布流"]) {
      expect(photographyCategoryLabels).not.toContain(word);
      expect(resolveLabelLayer(word)).toBe("tag");
      expect(evaluateGenreAdmission(word).admitted).toBe(false);
      expect(evaluateTagAdmission(word).admitted).toBe(true);
      expect(resolvePhotographyCategory(word)).toBeNull();
    }
    // 玻璃态/毛玻璃归 UI 组而非被「玻璃」材质误收。
    expect(getPromptTagGroup("玻璃态")).toContain("UI");
    expect(getPromptTagGroup("按钮")).toContain("UI");
    // 交付资源与模式的分类归属：图标集→图标设计；仪表盘仍是 UI 域叶子。
    expect(resolvePhotographyCategory("图标集")).toBe("图标设计");
    expect(resolvePhotographyCategory("仪表盘")).toBe("仪表盘");
    expect(resolvePhotographyCategory("设计系统")).toBe("组件库");
  });

  it("maps emerging design fields onto existing visual leaves", () => {
    // 动效/工业/环境设计与服务设计可视产物均有现成归属，零新叶。
    expect(resolvePhotographyCategory("动效设计")).toBe("3D动画");
    expect(resolvePhotographyCategory("Motion Design")).toBe("3D动画");
    expect(resolvePhotographyCategory("服务蓝图")).toBe("信息图表");
    expect(resolvePhotographyCategory("用户旅程图")).toBe("信息图表");
    expect(resolvePhotographyCategory("工业设计")).toBe("产品CG渲染");
    expect(resolvePhotographyCategory("环境设计")).toBe("景观设计图");
    // 非图像学科不入图像本体。
    expect(resolvePhotographyCategory("声音设计")).toBeNull();
    expect(resolvePhotographyCategory("UX写作")).toBeNull();
  });

  it("adds 织绣编结 to traditional arts and keeps craft materials in the tag layer", () => {
    expect(photographyCategoryLabels).toContain("织绣编结");
    expect(resolvePhotographyCategory("织绣编结")).toBe("织绣编结");
    expect(resolvePhotographyCategory("中国结")).toBe("织绣编结");
    expect(resolvePhotographyCategory("竹编")).toBe("织绣编结");
    expect(resolvePhotographyCategory("布艺")).toBe("织绣编结");
    // 工艺技法既有归属不变；材料词留在标签层。
    expect(resolvePhotographyCategory("漆艺")).toBe("漆画");
    expect(resolvePhotographyCategory("雕刻")).toBe("雕塑艺术");
    expect(resolveLabelLayer("树脂")).toBe("tag");
    expect(evaluateTagAdmission("刺绣").admitted).toBe(true);
    // 传统艺术域内单选（cap 3）。
    expect(
      dedupeExclusiveGenreLabels(["陶艺", "漆画", "织绣编结", "雕塑艺术"]),
    ).toEqual(["陶艺", "漆画", "织绣编结"]);
  });

  it("maps event vocabulary onto image genres, not org-management categories", () => {
    // 活动是拍摄对象，不是组织管理分类；各类活动词归对应图像题材。
    expect(resolvePhotographyCategory("学术会议")).toBe("活动摄影");
    expect(resolvePhotographyCategory("颁奖典礼")).toBe("活动摄影");
    expect(resolvePhotographyCategory("校园活动")).toBe("活动摄影");
    expect(resolvePhotographyCategory("志愿服务")).toBe("人文摄影");
    expect(resolvePhotographyCategory("赛事")).toBe("体育赛事摄影");
    expect(resolvePhotographyCategory("直播画面")).toBe("弹幕截图");
    // 管理性活动分类不入图像本体。
    expect(resolvePhotographyCategory("社会实践类")).toBeNull();
    expect(evaluateGenreAdmission("志愿服务类活动").admitted).toBe(false);
  });

  it("keeps apparel commodity items in the tag layer with proper grouping", () => {
    for (const item of ["羽绒服", "帽衫", "领带", "披肩", "腰带"]) {
      expect(photographyCategoryLabels).not.toContain(item);
      expect(resolvePhotographyCategory(item)).toBeNull();
      expect(evaluateTagAdmission(item).admitted).toBe(true);
    }
    expect(getPromptTagGroup("羽绒服")).toContain("服饰");
    expect(getPromptTagGroup("领带")).toContain("道具");
    // 穿搭类型由服饰造型维度承载；商品品目不升格为分类。
    expect(resolvePhotographyCategory("居家睡衣")).toBe("居家睡衣");
    expect(evaluateGenreAdmission("牛仔外套").admitted).toBe(false);
  });

  it("adds guofeng fictional/painterly styles and palace/temple scenes", () => {
    // 虚构题材调性（与赛博朋克同层）归风格流派，可与朝代/画质感并存。
    for (const style of ["武侠江湖", "仙侠玄幻", "敦煌风"]) {
      expect(photographyCategoryLabels).toContain(style);
      expect(resolvePhotographyCategory(style)).toBe(style);
    }
    expect(resolvePhotographyCategory("武侠")).toBe("武侠江湖");
    expect(resolvePhotographyCategory("仙侠")).toBe("仙侠玄幻");
    expect(resolvePhotographyCategory("敦煌飞天")).toBe("敦煌风");
    // 画意流派：工笔画为国画水墨姊妹叶；青绿山水归国画水墨。
    expect(resolvePhotographyCategory("工笔")).toBe("工笔画");
    expect(resolvePhotographyCategory("青绿山水")).toBe("国画水墨");
    // 古风场景：宫殿/寺庙入场景细分；竹林/江南烟雨归既有场地。
    expect(resolvePhotographyCategory("红墙")).toBe("宫殿宫苑");
    expect(resolvePhotographyCategory("道观")).toBe("寺庙道观");
    expect(resolvePhotographyCategory("竹林")).toBe("森林树木");
    expect(resolvePhotographyCategory("江南烟雨")).toBe("江南水乡");
    // 一张仙侠图 = 朝代 × 风格 ×场景多维并存；风格流派仍可2选。
    expect(
      dedupeExclusiveGenreLabels(["隋唐风", "仙侠玄幻", "宫殿宫苑", "汉服造型"]),
    ).toEqual(["隋唐风", "仙侠玄幻", "宫殿宫苑", "汉服造型"]);
    expect(dedupeExclusiveGenreLabels(["武侠江湖", "电影感"])).toEqual(["武侠江湖", "电影感"]);
  });

  it("resolves high-frequency atomic vocabulary mined from analysis cases", () => {
    expect(resolvePhotographyCategory("珍珠奶茶")).toBe("茶饮摄影");
    expect(resolvePhotographyCategory("腕表")).toBe("珠宝腕表摄影");
    expect(resolvePhotographyCategory("耳机")).toBe("电子数码摄影");
    expect(resolvePhotographyCategory("手办")).toBe("产品摄影");
    expect(resolvePhotographyCategory("禅意")).toBe("侘寂美学");
    expect(resolvePhotographyCategory("Y2K")).toBe("千禧年风");
    expect(resolvePhotographyCategory("泳装")).toBe("泳装造型");
    expect(resolvePhotographyCategory("东方美学")).toBe("东方传统");
    expect(resolvePhotographyCategory("玩具")).toBe("产品摄影");
    expect(resolvePhotographyCategory("气泡饮品")).toBe("非酒精饮品摄影");
  });

  it("groups pet breeds and digital devices as concrete tag leaves of their categories", () => {
    // 品种/设备是画面事实（具体），属标签层，与抽象题材分类分离。
    for (const breed of ["金毛", "柴犬", "布偶", "橘猫"]) {
      expect(resolveLabelLayer(breed)).toBe("tag");
      expect(evaluateTagAdmission(breed).admitted).toBe(true);
      expect(getPromptTagGroup(breed)).toContain("宠物");
    }
    for (const device of ["手机", "笔记本", "相机", "键盘"]) {
      expect(resolveLabelLayer(device)).toBe("tag");
      expect(getPromptTagGroup(device)).toContain("数码");
    }
    // 两层分离：金毛(标签·具体) ≠ 犬类摄影(分类·抽象)。
    expect(resolvePhotographyCategory("金毛")).toBeNull();
    expect(resolvePhotographyCategory("犬类摄影")).toBe("犬类摄影");
    // 品种/设备标签能在 sanitize 后留存。
    expect(sanitizePromptTags(["金毛", "手机"])).toEqual(
      expect.arrayContaining(["金毛", "手机"]),
    );
  });

  it("groups mined concrete tags into ingredient/prop/environment/text buckets", () => {
    expect(getPromptTagGroup("牛油果")).toContain("美食");
    expect(getPromptTagGroup("山楂片")).toContain("美食");
    expect(getPromptTagGroup("藤编托盘")).toContain("道具");
    expect(getPromptTagGroup("竹编提篮")).toContain("道具");
    expect(getPromptTagGroup("蓝天白云")).toContain("环境");
    expect(getPromptTagGroup("飞檐翘角")).toContain("环境");
    expect(getPromptTagGroup("榻榻米席面")).toContain("环境");
    expect(getPromptTagGroup("营养成分标注")).toContain("文字");
  });

  it("excludes watermarks/copyright/source overlays from both categories and tags", () => {
    for (const wm of ["防盗水印", "版权信息", "工作室水印", "摄影机构水印", "版权声明文字", "网站与联系方式", "底部工作室水印"]) {
      expect(evaluateTagAdmission(wm).admitted).toBe(false);
      expect(evaluateGenreAdmission(wm).admitted).toBe(false);
    }
    // sanitize 剥离水印、保留正常画面标签。
    expect(sanitizePromptTags(["防盗水印", "版权信息", "金毛"])).toEqual(["金毛"]);
    // 正常画面内容不受影响。
    expect(evaluateTagAdmission("牛油果").admitted).toBe(true);
  });

  it("keeps 儿童摄影 as a content type while 童趣写真 is the subject dimension", () => {
    // 两者同域不同层：内容类型仍归 儿童摄影，人物题材另开一维，互不覆盖。
    expect(resolvePhotographyCategory("儿童写真")).toBe("儿童摄影");
    expect(dedupeExclusiveGenreLabels(["儿童摄影", "童趣写真"])).toEqual(["儿童摄影", "童趣写真"]);
  });

  it("keeps at most one leaf per analysis dimension", () => {
    // 一张图只有一个主导情绪 / 一套色彩体系 / 一个年代感。
    expect(
      dedupeExclusiveGenreLabels(["宁静平和", "温馨治愈", "孤独疏离"]),
    ).toEqual(["宁静平和"]);
    // 色彩体系与光线条件是例外：各自压着两个子轴，允许取 2 个。
    expect(dedupeExclusiveGenreLabels(["绿色主导", "低饱和"])).toEqual(["绿色主导", "低饱和"]);
    expect(dedupeExclusiveGenreLabels(["绿色主导", "低饱和", "莫兰迪色"])).toEqual(["绿色主导", "低饱和"]);
    // 光源性质 + 光源方向
    expect(dedupeExclusiveGenreLabels(["自然光", "逆光"])).toEqual(["自然光", "逆光"]);
    expect(dedupeExclusiveGenreLabels(["自然光", "逆光", "柔光"])).toEqual(["自然光", "逆光"]);
    // 题材调性 + 画面质感
    expect(dedupeExclusiveGenreLabels(["法式复古", "油画质感"])).toEqual(["法式复古", "油画质感"]);
    // 光学手法 + 后期质感
    expect(dedupeExclusiveGenreLabels(["浅景深", "柔焦朦胧"])).toEqual(["浅景深", "柔焦朦胧"]);
    // 一张户外照可同时成立两个场地
    expect(dedupeExclusiveGenreLabels(["山地高原", "草地原野"])).toEqual(["山地高原", "草地原野"]);
    // 季节 + 时段天候
    expect(dedupeExclusiveGenreLabels(["夏季", "清晨"])).toEqual(["夏季", "清晨"]);
    expect(dedupeExclusiveGenreLabels(["山地高原", "草地原野", "花海花园"])).toEqual([
      "山地高原",
      "草地原野",
    ]);
    // 其余维度仍是单选
    expect(dedupeExclusiveGenreLabels(["少女写真", "情侣写真"])).toEqual(["少女写真"]);
    expect(dedupeExclusiveGenreLabels(["宁静平和", "温馨治愈"])).toEqual(["宁静平和"]);
    // 环境人像（小人物大景观）：肖像与风光分属不同内容域，必须都保留
    expect(dedupeExclusiveGenreLabels(["肖像摄影", "风光摄影"])).toEqual(["肖像摄影", "风光摄影"]);
    // 跨维度互不挤占：内容 + 风格 + 情绪 + 色彩 + 技法 全部保留
    expect(
      dedupeExclusiveGenreLabels(["肖像摄影", "写实主义", "宁静平和", "暖色主导", "浅景深"]),
    ).toEqual(["肖像摄影", "写实主义", "宁静平和", "暖色主导", "浅景深"]);
  });

  it("keeps the home category nav fixed to the core domains", () => {
    // Now includes both photography and non-photography image types.
    expect(homePhotographyCategoryLabels).toContain("商业");
    expect(homePhotographyCategoryLabels).toContain("人像");
    expect(homePhotographyCategoryLabels).toContain("游戏");
    expect(homePhotographyCategoryLabels).toContain("影视");
    expect(homePhotographyCategoryLabels).toContain("电商");
    expect(homePhotographyCategoryLabels).toContain("实验");
    expect(photographyCategoryGroupLabels).toContain("游戏美术");
    expect(photographyCategoryGroupLabels).toContain("混合与实验媒介");
    expect(photographyCategoryLabels).toContain("表情包");
    expect(photographyCategoryLabels).toContain("AI艺术");
    expect(photographyCategoryLabels).toContain("游戏角色立绘");
    expect(resolvePhotographyCategory("梗图")).toBe("Meme");
    expect(resolvePhotographyCategory("详情页")).toBe("详情页长图");
    expect(resolvePhotographyCategory("HUD")).toBe("UI游戏界面");
  });

  it("resolves legacy and broad labels to precise genres", () => {
    // Photography aliases (unchanged)
    expect(resolvePhotographyCategory("产品摄影")).toBe("产品摄影");
    expect(resolvePhotographyCategory("电商产品摄影")).toBe("产品摄影");
    expect(resolvePhotographyCategory("珠宝摄影")).toBe("珠宝腕表摄影");
    expect(resolvePhotographyCategory("风光")).toBe("风光摄影");
    expect(resolvePhotographyCategory("婚礼")).toBe("婚礼摄影");
    expect(resolvePhotographyCategory("婚纱摄影")).toBe("婚纱摄影");
    expect(resolvePhotographyCategory("婚纱照")).toBe("婚纱摄影");
    expect(resolvePhotographyCategory("美食摄影")).toBe("食品摄影");
    expect(resolvePhotographyCategory("咖啡摄影")).toBe("咖啡摄影");
    expect(resolvePhotographyCategory("奶茶")).toBe("茶饮摄影");
    expect(resolvePhotographyCategory("抹茶")).toBe("茶饮摄影");
    expect(resolvePhotographyCategory("鸡尾酒")).toBe("酒精饮品摄影");
    expect(resolvePhotographyCategory("果汁")).toBe("非酒精饮品摄影");
    expect(resolvePhotographyCategory("冲泡")).toBe("饮品制作过程摄影");
    expect(resolvePhotographyCategory("饮品摄影")).toBeNull();
    expect(resolvePhotographyCategory("人像写真")).toBe("肖像摄影");
    expect(resolvePhotographyCategory("Lookbook")).toBe("时尚摄影");
    // Non-photography aliases
    expect(resolvePhotographyCategory("插画")).toBe("数字插画");
    expect(resolvePhotographyCategory("板绘")).toBe("数字插画");
    expect(resolvePhotographyCategory("二次元")).toBe("动漫角色");
    expect(resolvePhotographyCategory("Anime")).toBe("动漫角色");
    expect(resolvePhotographyCategory("漫画")).toBe("漫画分镜");
    expect(resolvePhotographyCategory("C4D")).toBe("C4D风格");
    expect(resolvePhotographyCategory("产品渲染")).toBe("产品CG渲染");
    expect(resolvePhotographyCategory("海报")).toBe("海报设计");
    expect(resolvePhotographyCategory("Logo")).toBe("Logo标识");
    expect(resolvePhotographyCategory("国画")).toBe("国画水墨");
    expect(resolvePhotographyCategory("书法")).toBe("书法篆刻");
    expect(resolvePhotographyCategory("像素风")).toBe("像素画");
    expect(resolvePhotographyCategory("Pixel Art")).toBe("像素画");
  });

  it("filters unknown AI-created categories out of suggestions", () => {
    expect(normalizePhotographyCategorySuggestions(["产品摄影", "梦幻大片", "电商产品摄影"])).toEqual([
      "产品摄影",
    ]);
  });

  it("admits industry-like new categories including non-photography types", () => {
    // Photography
    expect(evaluateGenreAdmission("水下人像摄影").admitted).toBe(true);
    expect(evaluateGenreAdmission("产品摄影").mappedLeaf).toBe("产品摄影");
    // Non-photography should also be admissible
    expect(evaluateGenreAdmission("数字插画").mappedLeaf).toBe("数字插画");
    expect(evaluateGenreAdmission("概念原画").mappedLeaf).toBe("场景概念");
    // Still reject pseudo/style labels
    expect(evaluateGenreAdmission("高级感产品摄影").admitted).toBe(false);
    expect(evaluateGenreAdmission("红色产品摄影").admitted).toBe(false);
    // 光斑是画面上的光学产物，仍属标签层，不得升格为分类
    expect(evaluateGenreAdmission("自然光斑").admitted).toBe(false);
  });

  it("admits feature tags but rejects category names as tags", () => {
    expect(evaluateTagAdmission("香水").admitted).toBe(true);
    expect(evaluateTagAdmission("自然光斑").admitted).toBe(true);
    // 光线条件已升格为分类维度，「柔光」「逆光」不再是标签
    expect(evaluateTagAdmission("柔光").admitted).toBe(false);
    expect(evaluateTagAdmission("逆光").admitted).toBe(false);
    expect(evaluateTagAdmission("产品摄影").admitted).toBe(false);
    expect(evaluateTagAdmission("高级感摄影").admitted).toBe(false);
    // Non-photography category names should also be rejected as tags
    expect(evaluateTagAdmission("数字插画").admitted).toBe(false);
    expect(evaluateTagAdmission("3D角色").admitted).toBe(false);
  });

  it("keeps up to a primary + two secondaries per exclusive sibling set", () => {
    // Photography domain
    expect(dedupeExclusiveGenreLabels(["城市风光摄影", "风光摄影", "微距摄影"])).toEqual([
      "城市风光摄影",
      "风光摄影",
      "微距摄影",
    ]);
    expect(dedupeExclusiveGenreLabels(["风光摄影", "城市风光摄影"])).toEqual([
      "风光摄影",
      "城市风光摄影",
    ]);
    expect(
      dedupeExclusiveGenreLabels(["肖像摄影", "人物艺术摄影", "生活方式摄影", "婚礼摄影"]),
    ).toEqual(["肖像摄影", "人物艺术摄影", "生活方式摄影"]);
    // Non-photography domain
    expect(
      dedupeExclusiveGenreLabels(["数字插画", "厚涂插画", "扁平插画", "线稿插画"]),
    ).toEqual(["数字插画", "厚涂插画", "扁平插画"]);
    // Cross-domain always kept
    expect(
      dedupeExclusiveGenreLabels(["肖像摄影", "数字插画"]),
    ).toEqual(["肖像摄影", "数字插画"]);
    // Explicit caps still honoured
    expect(dedupeExclusiveGenreLabels(["风光摄影", "城市风光摄影"], 1)).toEqual(["风光摄影"]);
    expect(
      dedupeExclusiveGenreLabels(["肖像摄影", "人物艺术摄影", "生活方式摄影"], 2),
    ).toEqual(["肖像摄影", "人物艺术摄影"]);
  });

  it("rejects pseudo genres that belong in tags", () => {
    expect(isPseudoPhotographyGenreLabel("黑色咖啡摄影")).toBe(true);
    expect(isPseudoPhotographyGenreLabel("蓝色汽车摄影")).toBe(true);
    expect(isPseudoPhotographyGenreLabel("高级感产品摄影")).toBe(true);
    expect(isPseudoPhotographyGenreLabel("产品摄影")).toBe(false);
    expect(isPseudoPhotographyGenreLabel("微距摄影")).toBe(false);
    // Non-photography leaves should not be pseudo
    expect(isPseudoPhotographyGenreLabel("数字插画")).toBe(false);
    expect(isPseudoPhotographyGenreLabel("3D角色")).toBe(false);
  });

  it("groups home nav labels by fixed child categories", () => {
    // Photography
    expect(getHomePhotographyCategorySet("人像")?.has("肖像摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("人像")?.has("婚纱摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("商业")?.has("产品摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("自然")?.has("风光摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("技术")?.has("航拍摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("饮品")?.has("茶饮摄影")).toBe(true);
    // Non-photography
    expect(getHomePhotographyCategorySet("插画")?.has("数字插画")).toBe(true);
    expect(getHomePhotographyCategorySet("动漫")?.has("动漫角色")).toBe(true);
    expect(getHomePhotographyCategorySet("3D")?.has("3D角色")).toBe(true);
    expect(getHomePhotographyCategorySet("设计")?.has("海报设计")).toBe(true);
    expect(getHomePhotographyCategorySet("UI")?.has("App界面")).toBe(true);
    expect(getHomePhotographyCategorySet("传统")?.has("国画水墨")).toBe(true);
    expect(getHomePhotographyCategorySet("像素")?.has("像素画")).toBe(true);
    expect(getHomePhotographyCategorySet("未知")).toBeNull();
  });

  it("contains both photography and non-photography leaf categories", () => {
    // Photography
    expect(photographyCategoryLabels).toContain("产品摄影");
    expect(photographyCategoryLabels).toContain("美妆摄影");
    expect(photographyCategoryLabels).toContain("航天摄影");
    expect(photographyCategoryGroupLabels).toContain("饮品摄影");
    expect(photographyCategoryLabels).toEqual(expect.arrayContaining([
      "咖啡摄影",
      "茶饮摄影",
      "酒精饮品摄影",
      "非酒精饮品摄影",
      "饮品制作过程摄影",
      "饮品与场景结合摄影",
    ]));
    expect(photographyCategoryLabels).toContain("婚纱摄影");
    // Non-photography
    expect(photographyCategoryLabels).toContain("数字插画");
    expect(photographyCategoryLabels).toContain("动漫角色");
    expect(photographyCategoryLabels).toContain("3D角色");
    expect(photographyCategoryLabels).toContain("海报设计");
    expect(photographyCategoryLabels).toContain("App界面");
    expect(photographyCategoryLabels).toContain("国画水墨");
    expect(photographyCategoryLabels).toContain("像素画");
    // Aliases should NOT appear as leaf labels
    expect(photographyCategoryLabels).not.toContain("电商产品摄影");
    expect(photographyCategoryLabels).not.toContain("板绘");
    expect(photographyCategoryLabels).not.toContain("插画");
    // Total count: photography + non-photography content types + 15 analysis dimensions
    expect(photographyCategoryLabels.length).toBeGreaterThanOrEqual(180);
    expect(photographyCategoryLabels.length).toBeLessThanOrEqual(600);
  });
});
