# 素言创意画布功能最新概括与 AI 交接说明

> 快照时间：2026-08-02（北京时间）  
> 项目版本：`0.2.5`  
> 分支 / 基准提交：`master` / `fecf73e`  
> 实际依据：当前工作树源码。仓库存在大量未提交和未跟踪改动，因此提交号不能单独代表本文描述的实现。  
> 目标读者：接手完善画布功能的 AI Coder 或开发者。  
> 核心入口：`src/features/library/components/CanvasView.tsx`，当前约 1850 行。  
> 最近迭代：豆包后台生成流程（登录后隐藏网页、生成在后台跑、结果回原生画布）、豆包模型/风格切换按钮、去掉人为 1600ms 思考延迟、生成失败保留上一批结果。

本文不是产品设想，而是对当前实现的交接快照。若文档与源码冲突，以当前工作树源码、`AGENTS.md` 和 `.codex/rules/` 为准。

---

## 1. 一句话定位

创意画布是素材库内的本地桌面生图工作区，已经打通以下闭环：

```text
编辑正/负向提示词
  -> 选择已配置的生图 API，或免费的豆包网页画布
  -> 可选添加一张参考图
  -> 调用 OpenAI 兼容接口，或在内嵌豆包网页中发送文本
  -> 在画布中展示会话预览
  -> 自动把生成结果写入本地素材库
  -> 支持预览、下载和复用模型改写后的提示词
```

它不是自由拖拽、图层编辑型 Canvas，也没有节点编排、局部重绘、蒙版、画笔或无限画布能力。当前“画布”本质上是一个完整的 AI 图片生成与归档工作台。

---

## 2. 接手前必须遵守的项目边界

1. 技术栈只能是 `Electron + React + TypeScript + Vite + pnpm`。
2. 渲染进程不得直接访问 Node.js、文件系统、Electron 原始 API 或系统剪贴板。
3. 桌面能力必须经过 `window.suyanApi -> preload/contextBridge -> ipcRenderer/ipcMain -> 主进程`。
4. IPC channel 必须集中在 `electron/shared/ipcChannels.ts`，返回结构必须是 `{ ok: true, data }` 或 `{ ok: false, error }`。
5. 素材仍使用本地 `library.json + images/`；不得为画布引入账号、云同步、远程业务后端、数据库或复杂插件体系。
6. 用户可见文案使用简体中文，颜色使用 `src/styles/tokens.css` 的语义令牌。
7. 修改代码后必须先做就近测试，再执行 `pnpm typecheck`、`pnpm test` 和 `pnpm package:win`；正式产物要更新到 `release/win-unpacked/`。
8. 读取含中文的项目文件时必须显式指定 UTF-8。
9. 当前工作树很脏。不得重置、覆盖或清理与画布无关的现有改动。

画布完善前至少重新读取：

- `AGENTS.md`
- `.codex/rules/01-人设与开发准则.md`
- `.codex/rules/04-核心铁律与避坑.md`
- `.codex/rules/05-UI与组件规范.md`
- `.codex/rules/06-通信与数据获取规范.md`
- `.codex/rules/07-打包与交付规范.md`
- `.codex/rules/08-数据库与状态管理规范.md`
- `.codex/rules/09-日志管理规范.md`
- `.codex/rules/10-问题与解决方案记录.md` 中的 P074、P075、P076

---

## 3. 当前功能范围

### 3.1 已实现

- 正向提示词与负向提示词编辑。
- 两个提示词区独立显示 / 隐藏。
- 正向提示词框可拖拽调整高度，高度会记忆，范围 `192-720px`，默认 `340px`。
- 提示词复制、按光标位置粘贴、AI 优化、撤销、清空。
- 撤销历史每个字段最多 40 步；连续输入在 900ms 内合并为一步。
- 正向提示词支持一张参考图，可从本地文件、系统剪贴板或素材详情页加入。
- 文生图和图生图两条调用路径。
- 自动、按比例、自定义宽高三种尺寸模式。
- `1K / 2K / 4K` 基准分辨率。
- `1:1 / 3:2 / 2:3 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9` 八种比例。
- 透明背景、质量、PNG/JPEG/WEBP、1-4 张等高级参数。
- 从启用的 AI 配置中选择具有 `image-generation` 能力的模型。
- 可切换为“豆包网页画布（免费）”，豆包页面以内嵌 `WebContentsView` 占用现有右侧画布区域，不打开独立豆包窗口。
- 首次选择豆包网页画布时自动点开网页自身的小型登录弹窗；固定持久分区 `persist:suyan-doubao` 保留 Cookie、LocalStorage 等登录态。
- **豆包后台生成流程**：登录一旦完成，豆包 `WebContentsView` 被移到屏外（`x: -32000`，`visible` 保持 `true`），右侧恢复素言原生画布；之后的生成在屏外的 view 上向豆包注入提示词并轮询结果，结果仍回到原生画布展示与归档。只有“需要登录”或“会话过期”时，view 才恢复到画布宿主显示豆包登录弹窗。**关键：必须用屏外保持 `visible=true`，不能用 `setVisible(false)`**——隐藏的 view 会导致下拉浮层点不开、结果图不渲染、抓图 0 候选（曾在 08:28 复现 `DOUBAO_IMAGE_RESULT_TIMEOUT seenCandidates:0`）。`WebContentsView` 关闭了 `backgroundThrottling`，配合屏外可见保证后台注入与轮询不被节流。
- 豆包模式复用左侧正向 / 负向提示词、尺寸比例、张数和生成按钮；负向提示词会拼入正文，常用比例会尽量同步到网页控件。
- **豆包模型 / 风格切换**：仅 `doubao-web` 提供方在左栏尺寸面板下方显示，做成与「比例」面板一致的可收起卡片（`doubaoModelHidden` / `doubaoStyleHidden` 持久化，默认收起），收起时只显示当前选中值，点 Eye 才展开选项网格。选项写入画布草稿，生成时由主进程 `selectDoubaoDropdown` 在豆包页面上按可见文本匹配点击。空串表示“跟随网页默认”不做自动切换。预设值取豆包真实模型名（`doubaoModelOptions` 含 `Seedream 4.5`，来自 playwright 快照；`4.0`/`3.0` 为推测项，豆包页面可能只有 4.5，miss 不阻塞）；风格下拉真实可选文本快照未捕获，先列常见项。点不中只记 WARN（`doubao-web:dropdown-miss`）不中断生成，且 miss 时用 Escape 收起下拉、绝不点击页面 body。预设集中在 `canvasGeneration.ts` 的 `doubaoModelOptions` / `doubaoStyleOptions`，真机确认后可在此调整。
- 豆包生成结果抓取限定在结果消息区（含「做同款」按钮的容器）内、`naturalWidth >= 512` 的大图，避免占位图 / 侧栏缩略图被当结果；下载后用 `detectGeneratedImageExtension` 按文件签名校验是真实 PNG/JPEG/WEBP，无效则丢弃继续轮询而非返回（修复“生成图片内容无法识别”与等不到有效图的超时）。`blob:` 图片走页面上下文读取，其余走主进程持久会话下载，再走现有自动归档链路。
- 所有提供方的实际负向提示词都强制包含无水印约束；豆包还会追加“干净原始画面”指令，并直接读取原始图片资源，不截取带网页叠层的画布截图。
- 画布默认模型选择持久化到 AI 设置。
- 生成阶段状态机、关键词动画、参考图模糊背景、结果揭示动画。
- 生成结果会先出现在会话预览中，再自动归档到素材库。
- AI 自动总结素材标题；不可用时使用本地关键词短标题兜底。
- 结果悬浮操作：打开、下载、复用提示词。
- 全屏预览：关闭、上一张、下一张、键盘方向键、Esc、下载、复用提示词、模型与实际像素尺寸详情。
- 可选完成提醒，通过本机 `TapRelay` 的 `http://localhost:1122/send` 发送生成成功或失败通知。
- 支持从素材详情页只传提示词，或同时传效果图、正向提示词和负向提示词到画布。
- 视频详情不会把视频作为参考图传入画布。

### 3.2 当前没有

- 生成任务取消、暂停、队列、并发任务或历史任务列表。
- 多参考图、参考图权重、蒙版或局部重绘。
- 图层、画笔、选区、裁切、旋转、自由拖拽或无限画布。
- Seed、steps、CFG、sampler 等 Stable Diffusion 专属参数。
- 每个模型的参数能力协商与自动降级。
- 画布会话的磁盘持久化；重启后会话预览会消失，但已归档图片仍在素材库。
- 从画布直接删除素材库图片、复制图片到系统剪贴板、打开素材详情或定位到素材库分组。
- 豆包参考图自动上传，以及对网页模型、风格、透明背景、输出格式和质量参数的完整自动控制；这些仍以豆包页面实际支持为准。
- 对第三方源文件中已经强制嵌入的水印做无损像素级移除；当前策略是源头约束和原图资源提取，不能把平台强制水印误报为已去除。

---

## 4. 页面布局现状

### 4.1 顶层结构

```text
CanvasView
├── 页面标题
│   ├── “AI 创意画布”标识
│   ├── “把灵感变成画面”
│   └── OpenAI 兼容 API 与自动归档说明
└── 主体网格
    ├── 左栏：创作参数，桌面宽度固定 380px
    └── 右栏：API 结果画布或内嵌豆包网页，自适应剩余宽度，最小高度 520px
```

- 页面最大宽度为 `1400px`，居中显示。
- `lg`（1024px）及以上为左右两栏；小于 1024px 时上下堆叠。
- 外层使用响应式水平内边距。
- 左右主体都是带边框、背景与阴影的大圆角面板。

### 4.2 左栏顺序

```text
创作标题
-> 正向提示词
-> 正向主操作：优化提示词 / 添加参考图 / 更多
-> 参考图缩略图与参考图弹层
-> 负向提示词（可选）
-> 比例与尺寸
-> 高级设置（默认折叠）
-> 当前生图配置
-> 内联错误提示
-> 完成提醒开关 + 生成按钮
```

正向提示词把高频的“优化”和“添加参考图”放在主操作行，复制、粘贴、撤销、清空收入“更多”菜单。负向提示词仍使用五列按钮：复制、粘贴、优化、返回、清空。

### 4.3 右栏状态

右侧使用统一状态机：

```text
empty -> thinking -> generating -> reveal -> created
                         |             |
                         +--失败------> empty
```

- `empty`：空态引导。
- `thinking`：固定 1600ms 的“正在理解你的想法”，展示从正向提示词本地抽取的最多 5 个关键词。
- `generating`：真实远程请求阶段；每 1400ms 轮换“解析画面结构 / 勾勒主体与光线 / 精修细节 / 合成中”。
- `reveal`：约 500ms 的结果揭示动画。
- `created`：静态结果展示。

生成中若有参考图，会把参考图作为低透明度、强模糊的背景。动画支持 `prefers-reduced-motion`，用户要求减少动态效果时会关闭。

豆包模式不替换页面结构：`CreativeCanvas` 仍是右栏容器，只在内部提供定位宿主；renderer 用 `getBoundingClientRect()` 同步坐标，主进程把一个沙箱化 `WebContentsView` 覆盖到该区域。滚动、缩放、窗口尺寸变化时会重新同步，离开画布或切回 API 时会隐藏原生视图。

### 4.4 结果布局

- 1 张：单列居中，`object-contain`，最大高度约 `70vh`。
- 2-4 张：两列方形网格，缩略展示使用 `object-cover`。
- 3 张：追加一个虚线占位块，补齐 2x2 视觉结构。
- 未完成素材归档时，卡片左上角显示“归档中”。
- 双击卡片或点击“打开”进入全屏预览。

---

## 5. 状态与持久化

### 5.1 会写入 `view-settings.json` 的画布草稿

类型为 `CanvasDraftSettings`：

```ts
type CanvasDraftSettings = {
  generationProvider: "api" | "doubao-web";
  prompt: string;
  positivePromptHeight: number;
  referenceImageFileName: string;
  referenceImageTitle: string;
  referenceImageDataUrl: string;
  negativePrompt: string;
  negativePromptHidden: boolean;
  positivePromptHidden: boolean;
  sizePanelHidden: boolean;
  sizeMode: "auto" | "ratio" | "custom";
  baseResolution: "1k" | "2k" | "4k";
  aspectRatio: "1:1" | "3:2" | "2:3" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
  customWidth: number;
  customHeight: number;
  quality: "auto" | "low" | "medium" | "high";
  outputFormat: "png" | "jpeg" | "webp";
  count: number;
  transparentBackground: boolean;
  notificationEnabled: boolean;
  doubaoModel: string;
  doubaoStyle: string;
};
```

`updateCanvasDraft()` 先立即更新 Zustand，再以 450ms 防抖通过 `saveLibraryViewSettingsSerialized()` 持久化。

特殊规则：`referenceImageDataUrl` 只在当前会话内保存，写磁盘前强制清空，避免把大块 base64 塞入设置文件。参考图文件名和标题仍会进入设置，但没有 data URL 时不会触发图生图。

### 5.2 只保存在 Zustand 会话内

- `canvasGenerationResults: CanvasGenerationResult[]`
- `canvasLastModel: string`

它们位于 `useLibraryStore`，因此离开画布再返回仍能看到；关闭或重启应用后会清空。

`CanvasGenerationResult` 在远程结果上增加 `saved: boolean`：

- `false`：已经拿到图片，正在归档。
- `true`：这一批所有图片均已成功写入素材库。

### 5.3 只在 `CanvasView` 组件内

- 正 / 负提示词撤销栈。
- 当前生成阶段与关键词。
- 正在优化、正在生成、内联错误。
- 模型菜单、更多菜单、参考图弹层、高级设置的打开状态。
- 全屏预览索引与详情开关。
- thinking / reveal 定时器。

高级设置是否展开、撤销历史和预览弹层状态不会跨组件卸载保留。

### 5.4 AI 模型选择

画布只展示：

```text
启用的 profile
  + profile 下 capabilities 包含 image-generation 的 model
```

选择结果保存到 `ai-settings.json` 的 `actionPreferences["image-generation"]`。API Key 只在主进程设置中使用，公开给渲染层的设置只有 `hasApiKey` 和脱敏预览。

画布提供方保存到 `view-settings.json` 的 `canvasDraft.generationProvider`。豆包登录态不写入画布草稿，也不是素言账号系统；它由 Electron 持久 session 分区管理。只要豆包没有让会话过期、撤销或触发重新验证，应用重启后会直接复用登录态。

---

## 6. 尺寸与参数规则

### 6.1 自动模式

向接口发送 `size: "auto"`。

### 6.2 按比例模式

1K 沿用常见 OpenAI 兼容尺寸：

- 接近方形：`1024x1024`
- 横图：`1536x1024`
- 竖图：`1024x1536`

因此 1K 下的 `21:9` 等比例并不是精确像素比例，而是映射到接口较常见的最近尺寸。

2K / 4K 会把长边限制为 2048 / 4096，再按目标比例计算短边并按 64 像素取整。例如：

- 2K、1:1 -> `2048x2048`
- 4K、16:9 -> `4096x2304`

### 6.3 自定义模式

- 宽高限制在 `256-4096`。
- UI 输入步长是 64。
- 归一化只做整数取整和范围截断，不会强制改为 64 的倍数。

### 6.4 联动

- 张数限制 `1-4`。
- 开启透明背景时实际输出格式强制为 PNG。
- 透明背景时 JPEG 选项禁用。
- `background` 只有非自动值才发送给上游。
- 负向提示词不是独立 API 字段，而是拼接到正向提示词后：`Negative prompt / 反向约束：...`。
- 即使用户清空负向提示词，实际生成请求仍会加入“水印、文字、Logo、签名、平台标识”排除项；已有 `水印 / watermark` 约束时不会重复追加。

不同服务商未必支持全部尺寸、质量、格式、透明背景和多图参数；当前没有按模型能力隐藏或降级参数。

---

## 7. 完整数据流

```text
CanvasView
  |  onGenerate(payload)
  v
LibraryView.generateImagesWithAi
  |-- provider=api -> window.suyanApi.generateImagesWithAi
  |-- provider=doubao-web -> window.suyanApi.generateImagesWithDoubaoWeb
  v
preload: 白名单 IPC
  v
ipcMain: ai:generate-images 或 doubao-web:generate
  v
API 分支：promptAnalysisService.generateImagesWithRemoteAi
  |  解析 actionPreferences["image-generation"] 与私密 API Key
  v
remoteAiClient.generateImagesWithOpenAiCompatible
  |-- 无参考图 -> POST /images/generations，JSON
  |-- 有参考图 -> POST /images/edits，multipart/form-data
  v
响应 data[].b64_json 或 data[].url
  |-- URL 会由主进程下载并转 data URL
  v
CanvasView 会话预览，saved=false
  v
并行标题总结结果 / 本地标题兜底
  v
window.suyanApi.importGeneratedImages
  v
ipcMain: image:import-generated
  v
主进程按文件内容识别 PNG/JPEG/WEBP
  v
写入 data/library/images/ + 一次性 append library.json
  v
预热缩略图、更新 Zustand、saved=true
```

豆包分支在 `electron/main/ai/doubaoWebCanvas.ts` 内完成：加载 `/chat/create-image`、检查持久登录态、写入提示词、触发网页生成、等待新增结果图片、转为 data URL。网页内容始终位于主窗口的右侧画布区域；允许的豆包 / 抖音 / 飞书登录跳转在同一个视图内完成。

### 7.1 文生图

- 目标端点规范化为 `/images/generations`。
- 使用 JSON 请求。
- 请求字段：`model / prompt / n / size / quality / output_format / background`。

### 7.2 图生图

- 只要 `referenceImageDataUrl` 非空，就切换到 `/images/edits`。
- 使用 `multipart/form-data`，图片字段名为 `image`。
- 主进程按文件签名识别真实 MIME，不信任 data URL 声明或扩展名。
- 当前只支持 PNG、JPEG、WEBP。
- 参考图主进程上限为 50MB。
- 404 / 405 / 501 会明确提示接口不支持 `/images/edits`。
- 413、415、超时和格式损坏都有独立错误提示。

### 7.3 响应兼容

- 支持 `b64_json`。
- 支持远程 `url`，由主进程下载后转为 data URL。
- 支持可选的 `revised_prompt`。
- 最多消费响应前 4 张有效图片。

### 7.4 自动标题

标题总结和生图请求并行启动，以减少额外等待。标题总结复用 `prompt-optimization` 这条文本模型动作配置；若未配置、失败或超时，则从提示词本地提取最多 3 个短关键词，拼成不超过 24 字符的标题。

### 7.5 自动归档

生成图片不由 renderer 用 `fetch(dataUrl)` 再拼素材，而是走专用 `image:import-generated` IPC：

1. 主进程重新校验 data URL。
2. 根据真实文件签名确定扩展名，不能只信 MIME。
3. 按远程返回顺序逐张写入托管图片目录。
4. 为每张图片创建完整素材项，写入标题、正向提示词、负向提示词、生成模型和 `promptType: "image"`。
5. 一次性追加到 `library.json`。
6. 预热新图片缩略图。

同批图片使用同一标题、提示词和创建时间，顺序必须保持远程响应顺序。后续修改不能破坏“提示词组原始效果图第一、后续效果图按加入时间追加”的项目铁律。

---

## 8. 从素材详情传送到画布

有两种入口：

### 8.1 只传提示词

- 覆盖画布正向提示词。
- 只有负向提示词非空时才覆盖负向提示词，并自动展开负向提示词区。
- 关闭详情弹窗，进入画布。

### 8.2 传效果图与提示词

- 视频入口禁用。
- 通过应用图片协议读取当前效果图。
- 转成适合画布的图片 Blob，再读成 data URL。
- 在一次草稿更新中写入参考图、正向提示词和负向提示词。
- 打开画布后自动展开参考图弹层。
- 有结构化性能日志：`canvas-transfer:click / done / failed`。

这条链路必须继续兼容托管素材、外链素材和缩略图不可用时的原图解析逻辑，不得改成 renderer 直接读本地文件路径。

---

## 9. 错误、超时、重试与日志

### 9.1 当前远程策略

- 图像生成总截止时间：250 秒。
- `imageGenerationMaxRetries = 2`，即首次请求之外最多再重试 2 次，但所有尝试共享 250 秒总截止时间。
- 只对判定为瞬时网络错误的异常重试，例如 `other side closed`。
- HTTP 错误被包装成 `AppError` 后立即抛出，不重试；429 配额不足不会靠重试解决。
- 重试间隔以 400ms 为基数递增。

### 9.2 日志内容

远程生图会记录：

- endpoint host / path
- 是否有参考图
- 模型、尺寸
- 参考图字节数与 MIME
- 耗时、结果数量、结构化错误码

自动归档会记录提示词哈希、提示词长度、图片数量和导入结果，不应记录完整提示词或图片 base64。

### 9.3 完成提醒

用户开启后，主进程会在成功或失败时向本机 TapRelay 发送通知。通知失败只写 WARN，不影响生图结果。当前通知包含截断后的提示词预览（最多约 60 字符），进一步完善隐私设置时需要把这一点作为明确产品决策。

---

## 10. 现有测试覆盖

画布相关的直接测试文件：

| 测试 | 当前覆盖重点 |
|---|---|
| `tests/unit/canvasGeneration.test.ts` | 默认草稿、归一化、尺寸映射、透明背景联动、关键词抽取 |
| `tests/unit/doubaoWebCanvasIntegration.test.ts` | 持久沙箱分区、`WebContentsView` 内嵌、无独立 `BrowserWindow`、画布宿主与 IPC 路由 |
| `tests/unit/canvasViewControls.test.ts` | 控件存在、剪贴板桥、参考图入口、草稿持久化源码约束 |
| `tests/unit/canvasGenerationSession.test.ts` | 结果与最后模型保存在 Zustand，会跨 CanvasView 重挂载 |
| `tests/unit/canvasRemoteIntegration.test.ts` | 透明 PNG、图生图 multipart、内容 MIME 检测、负向优化约束 |
| `tests/unit/aiImageGeneration.test.ts` | 端点规范化、base64 响应、`/images/edits`、不支持图生图提示 |
| `tests/unit/generatedImageData.test.ts` | 生成图片按文件签名识别格式、拒绝损坏数据 |
| `tests/unit/generatedImageImportFlow.test.ts` | 专用归档 IPC 和一次性素材库追加 |
| `tests/unit/aiActionModelPreference.test.ts` | 动作级模型选择与 AI 设置持久化 |
| `tests/unit/promptDetailActions.test.ts` | 详情页向画布传图、正向与负向提示词 |

注意：其中多项是读取源码并断言字符串存在的静态测试，能够防止关键调用被误删，但不能替代真实 DOM 交互、响应式布局、键盘焦点、IPC 集成和正式包生图烟测。

建议的就近验证命令：

```powershell
pnpm exec vitest run `
  tests/unit/canvasGeneration.test.ts `
  tests/unit/doubaoWebCanvasIntegration.test.ts `
  tests/unit/canvasViewControls.test.ts `
  tests/unit/canvasGenerationSession.test.ts `
  tests/unit/canvasRemoteIntegration.test.ts `
  tests/unit/aiImageGeneration.test.ts `
  tests/unit/generatedImageData.test.ts `
  tests/unit/generatedImageImportFlow.test.ts `
  tests/unit/aiActionModelPreference.test.ts `
  tests/unit/promptDetailActions.test.ts
```

---

## 11. 已确认的完善机会

以下不是凭空规划，而是从当前代码直接可见的限制。接手者应先选一个小范围切片，不要同时重写页面和主进程链路。

### P0：不可破坏的行为

1. 保留 renderer / preload / main 的安全边界，API Key 不得进入 renderer。
2. 保留生成图片按真实文件内容识别格式的校验。
3. 保留生成后自动归档、批次顺序、完整提示词元数据和缩略图预热。
4. 保留动作级生图模型持久化。
5. 保留草稿持久化时剥离 `referenceImageDataUrl`。
6. 保留错误结构化返回、脱敏日志、250 秒总截止时间和“仅瞬时网络错误重试”。
7. 保留素材详情传入正 / 负提示词与参考图的完整链路。
8. 豆包页面必须继续使用沙箱化 `WebContentsView` 和固定持久分区，不能退回独立窗口、`<webview>` 标签或 renderer 直连 Electron。

### P1：可靠性与体验优先

1. **没有取消能力。** 真实请求开始后，用户不能取消；离开页面也不会通过 IPC 中止主进程 fetch。应设计任务 ID、AbortController 注册表和明确的取消结果。（**仍未做**——`remoteAiClient` 内部已有 `AbortController`，但尚未暴露信号与取消 IPC；本次迭代聚焦豆包后台流程，未碰取消链路。）
2. ~~**生成前先清空旧结果。**~~ 已处理：点击生成不再立即清空旧预览，新结果成功就位才替换；新请求失败时保留上一批可见预览，而不是清成空态。
3. ~~**人为增加 1600ms 延迟。**~~ 已处理：思考（THINKING）与真实请求并行，请求立即开始，去掉了串行的 1600ms 定时延迟，总耗时不再被叠加。
4. **参考图以内存 data URL 存在 renderer。** 接近 50MB 的图片会明显放大 renderer 内存和序列化成本。可改为主进程托管临时引用、renderer 只持有安全 URL / token，但仍必须走白名单 IPC。
5. **参数没有模型能力协商。** 2K、4K、自定义尺寸、WEBP、透明背景和 `n > 1` 可能被部分兼容服务拒绝。应在模型配置中表达能力，或对常见参数错误提供可解释降级，禁止静默篡改用户选择。
6. **归档失败后的恢复不足。** 预览会保持 `saved:false`，但没有“重新归档”按钮，也没有暂存恢复机制。

### P2：交互与可访问性

1. 当前配置菜单、更多菜单和参考图弹层使用组件内 `position: absolute`，没有按项目 UI R9 使用 Portal；在后续布局加入 overflow 后可能被裁剪。
2. 全屏预览缺少 `role="dialog"`、焦点锁定、打开时的背景滚动锁定和关闭后的焦点恢复。
3. 多图结果在方形卡片中使用 `object-cover`，会裁掉非方形构图；可以保持稳定网格尺寸，同时给用户明确的完整画面查看信号。
4. 当前下载通过 renderer 创建 `<a download>` 下载 data URL，没有系统保存位置选择、主进程写入校验或统一命名策略。
5. 画布没有“打开素材详情 / 定位到素材库 / 复制图片 / 从画布列表移除预览”等自然的后续操作。
6. 高级设置的展开状态不持久化；是否需要记忆应先做产品判断。
7. 只有一张参考图，没有替换前确认、压缩提示、尺寸与文件大小预检。

### P2：代码结构与测试

1. `CanvasView.tsx` 约 1700 行，包含页面、表单、弹层、状态机、结果网格和全屏预览。可按稳定职责拆分，但不要把状态分散到多个互相同步的局部 state。
2. 现有不少测试是源码字符串断言。应逐步补充 React 交互测试、IPC 参数验证、失败恢复和任务取消测试。
3. 标题总结复用 `prompt-optimization` 动作配置，属于隐式耦合。可决定继续复用并写清楚，或新增独立 action；不能静默改变用户现有模型设置。
4. `electron/main/library/imageFiles.ts` 的生成图片归档日志使用模块名 `image-generation`，与项目日志规范允许的固定模块集合不一致；应归到 `ai` 或 `library` 并补测试。
5. `imageGenerationMaxRetries = 2`，附近注释仍写“单次重试”，注释与代码不一致。
6. 自定义尺寸 UI step 为 64，但归一化不强制 64 的倍数；应明确这是允许任意整数还是要求模型友好尺寸。

---

## 12. 推荐的迭代顺序

### 第一阶段：可靠生成

- 请求立即开始，重构 thinking 最小时长。
- 增加取消任务。
- 新生成失败时保留上一批结果。
- 增加归档失败重试。
- 为错误状态补可操作的下一步，不只显示文本。

### 第二阶段：服务商兼容

- 为模型记录尺寸、格式、透明背景、多图、图生图能力。
- 在发请求前校验参数并解释不兼容项。
- 针对不同 OpenAI 兼容变体增加适配层，保持统一 renderer payload。

### 第三阶段：画布工作流

- 增加最近生成会话或从素材库回看本次批次。
- 增加“打开素材详情 / 定位素材 / 复制图片 / 再次归档”。
- 评估多参考图和参考图管理；不要直接扩展成复杂图层编辑器。

### 第四阶段：结构与视觉

- 拆分 `CanvasView.tsx`。
- 将菜单和弹层迁移到 Portal。
- 完善键盘、焦点、窄屏布局和真实图片比例展示。
- 用真实浏览器或正式 Electron 包做桌面 / 窄屏截图验证。

---

## 13. 关键源码索引

| 文件 | 职责 |
|---|---|
| `src/features/library/components/CanvasView.tsx` | 画布 UI、局部交互、生成状态机、结果预览 |
| `src/features/library/components/LibraryView.tsx` | 懒加载画布、详情传送、renderer 生图桥接 |
| `src/features/library/store/useLibraryStore.ts` | 草稿 / 会话结果状态、草稿持久化、标题总结、生成图归档 |
| `src/features/library/types/canvas.ts` | 画布草稿与会话结果类型 |
| `src/features/library/utils/canvasGeneration.ts` | 默认值、归一化、尺寸换算、关键词抽取 |
| `src/features/library/types/ai.ts` | 生图 / 优化 / 标题总结 payload 和响应类型 |
| `src/features/library/components/AiSettingsDialog.tsx` | 模型能力配置与画布默认模型入口 |
| `src/features/library/components/PromptDetailDialog.tsx` | 提示词 / 效果图传送到画布入口 |
| `src/styles/tokens.css` | 画布玻璃态、进度、关键词和揭示动画 |
| `src/types/suyanApi.ts` | renderer 可用的白名单桌面 API 类型 |
| `electron/shared/ipcChannels.ts` | 生图、归档、剪贴板等 IPC channel |
| `electron/preload/index.ts` | `window.suyanApi` 的最小桥接 |
| `electron/main/ipc/registerIpcHandlers.ts` | payload 归一化与 IPC handler 注册 |
| `electron/main/ai/promptAnalysisService.ts` | 运行时模型解析、生成服务、TapRelay 通知 |
| `electron/main/ai/aiSettingsModel.ts` | 动作级模型与 capability 归一化 |
| `electron/main/ai/remoteAiClient.ts` | OpenAI 兼容请求、端点、图生图、响应、超时与重试 |
| `electron/main/ai/doubaoWebCanvas.ts` | 豆包持久会话、内嵌视图、登录弹窗、文本提交、比例适配与结果抓取 |
| `electron/main/library/generatedImageData.ts` | 生成图 data URL 解码与真实格式检测 |
| `electron/main/library/imageFiles.ts` | 生成图写入托管目录并追加素材库 |
| `electron/main/library/viewSettingsStore.ts` | 画布草稿磁盘读取、归一化与原子写入 |

---

## 14. 给下一个 AI 的执行要求

可直接把下面内容和本文一起交给接手 AI：

```text
请先完整读取 W:\提示词\AGENTS.md、W:\提示词\.codex\rules\ 和
W:\提示词\docs\canvas-layout-summary.md，再检查当前工作树源码。

目标是完善“创意画布”，但不要把它误解为自由绘图 Canvas。先从本文第 11 节选择一个
边界明确的改进切片，说明现状证据、用户价值、数据流影响和回归边界后再修改。

必须保留 Electron 进程隔离、动作级模型配置、参考图内容校验、生成图真实格式识别、
自动归档、素材顺序、草稿持久化和结构化错误。不要重置当前工作树，不要修改无关模块。

完成代码改动后依次执行相关 Vitest、pnpm typecheck、pnpm test、pnpm package:win，
并报告 release\win-unpacked\素言.exe 与 resources\app.asar 的最新时间。
```

---

## 15. 验收口径

任何画布改进至少检查：

- 无 API Key、无生图模型、提示词为空时反馈明确。
- 选择豆包网页画布不要求 API Key，不产生独立豆包窗口，登录弹窗位于右侧画布内部。
- 重启应用后豆包登录态仍可复用；豆包主动使会话过期时能重新显示登录弹窗。
- 文生图与带参考图的图生图都不回归。
- PNG/JPEG/WEBP 声明与真实内容不一致时仍按内容处理。
- 1-4 张结果顺序稳定，自动归档数量准确。
- 新图归档后素材库可读取，缩略图可生成，原图仍是提示词组第一张。
- 页面离开再返回时草稿与本次预览符合设计。
- 正 / 负提示词优化使用正确的作用域。
- 透明背景不会发送 JPEG。
- 网络断开、超时、429、接口不支持图生图、参考图过大都有可理解的错误。
- 不在日志中写 API Key、完整提示词或 base64。
- 归档图片来自原始资源而不是页面截图，且实际请求包含无水印约束；若平台源文件强制带水印，应报出限制而不是做有损遮盖。
- 键盘、窄屏、深浅主题和减少动态效果模式可用。
- 正式包完成打包并更新正式 `release` 目录。
