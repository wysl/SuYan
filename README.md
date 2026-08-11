<div align="center">

# 素言 SuYan

**简体中文** | [English](./README.en.md)

**本地 AI 提示词与图像素材管理工具**

帮你把效果图和提示词收在一起，随时找、随时改、随时带走

[GitHub](https://github.com/guliacer/SuYan) · [核心亮点](#-核心亮点) · [功能全景](#-功能全景) · [快速开始](#-快速开始) · [更新日志](#-更新日志) · [常见问题](#-常见问题) · [收费公示](#-收费公示) · [致谢](#-致谢)

**永久免费 · 开源分享 · 遇收费请 [举报](https://github.com/guliacer/SuYan/issues)**

<br/>

<img src="./photo/界面展示.gif" alt="素言界面总览" width="860" />

<p><sub>
<strong>主界面大概长这样：</strong>左边切换素材库、导入、词库和设置；中间是瀑布流卡片，每张卡片绑着效果图和提示词摘要。
可以调列数、搜标题或提示词、按分类 / 标签 / 精选筛选，也能按时间、尺寸或随机排序。
点进卡片就能编辑、复制或分享。
</sub></p>

</div>

> 💚 **素言始终免费，欢迎放心使用。**  
> 项目基于 MIT 协议开源，软件本身不收费，也没有付费激活或会员。  
> 如果网上有人在卖安装包、收「安装服务费」等——**请直接举报**，不要付款，优先从 [GitHub](https://github.com/guliacer/SuYan) 下载。  
> 也欢迎把链接、截图或店铺信息 [发给我们](https://github.com/guliacer/SuYan/issues)：核实后会在下方 [收费公示](#-收费公示) 中列出，避免更多人上当。

---

## ✨ 核心亮点

> **素言** 把效果图、正 / 负向提示词、分类标签和可替换词条放进同一套本地库，灵感能搜到、能复用、也能一键带走。

- 🗂️ **本地优先** — 素材和提示词都在本机，打开就能用，不依赖云同步
- 🖼️ **图文一体** — 效果图和提示词绑在一起看，浏览、编辑、复制、分享顺手
- ✨ **AI 可选** — 拆参数、扩词条、反推、翻译、优化，需要时再上；不配也能用
- 🧹 **好整理** — 压缩、去重、批量导入导出，库大了也不慌

---

## 🚀 功能全景

按日常使用顺序浏览即可。每个模块先看能力说明，再对照演示动图。

### 🏠 素材浏览

- **瀑布流画廊** — 卡片浏览图片 / 视频提示词，列数可调
- **全文搜索** — 按标题、文件名、提示词或标签找
- **筛选与排序** — 按分类、标签、精选筛；按导入 / 修改时间、尺寸或随机排
- **精选收藏** — 一键标心，单独看喜欢的那批

<img src="./photo/界面展示.gif" alt="素材浏览界面" width="860" />

---

### 📥 导入素材

- **导入图片** — 本机批量选图入库
- **目录直挂** — 添加已有图片 / 视频目录后只建立索引，不复制原始媒体；删除条目不会删除原文件
- **粘贴导入** — 剪切板图片直接贴进来
- **导入文档** — 识别 Word 里的图和对应提示词
- **导入分享** — 导入别人的 ZIP，或解析网络分享链接

#### 本地导入

左侧「导入素材」→「导入图片」，多选本机文件即可入库；也支持粘贴与 Word 图文。

<img src="./photo/本地素材导入.gif" alt="本地素材导入" width="860" />

#### 网络导入

粘贴分享链接后，软件会解析并下载远程图文到本地。若站点要代理，先到「网络代理」配好再试。

<img src="./photo/网络素材导入.gif" alt="网络素材导入" width="860" />

#### 分享包导入

详情页或「批量管理」可导出 ZIP（含图与提示词）；对方用「导入分享」一键入库，无需账号。

<img src="./photo/分享与导入.gif" alt="分享与导入" width="860" />

---

### 🗂️ 批量管理

- **统一列表** — 一眼看到各组数量和标签概况
- **批量导出 / 导入** — 勾选导出分享包，或批量导入整理
- **批量删除** — 多选一次清掉，删除前会再确认
- **图像压缩** — 批量压图，可原格式或 WebP，质量可调
- **视频压缩** — 批量压视频，可选目标分辨率
- **去重检测** — 扫重复图，留一份清掉多余

<img src="./photo/去重-压缩.gif" alt="去重与压缩" width="860" />

---

### 📝 提示词详情

- **图文对照** — 一边看效果图，一边改正 / 负向提示词
- **复制 / 分享** — 复制到剪切板，或导出分享包
- **分类与标签** — 手改，也能让 AI 给建议
- **模型标注** — 记下生成方式，以后好筛、好回想
- **多图管理** — 同一组可挂多张效果图，支持导入、标心、删除

在瀑布流点开任意卡片即可进入详情。

---

### ✨ AI 创作助手

- **参数分析** — 长提示词拆成可点胶囊，局部替换更轻松
- **AI 词条** — 按当前参数生成同类候选词
- **提示词优化** — 按规则整理结构，画面更好控
- **中英翻译** — 尽量保住参数结构做互译
- **图像反推** — 根据效果图反推完整提示词
- **规则预设** — 不同操作可配不同服务商 / 模型 / 规则，右键快切

<img src="./photo/AI分析操作指引.gif" alt="AI 分析操作" width="860" />

> 先在「模型配置」里填好接口；不配 AI 也能正常本地浏览和编辑。

---

### 🎬 视频提示词

- **视频卡片** — 单独展示，带封面和时长
- **关键帧时间轴** — 一键出关键帧，方便看镜头节奏
- **参考素材** — 从文件、剪切板或链接导入参考图 / 音频

---

### 📚 词库组织

- **分类** — 分组、说明、配图
- **标签** — 统一命名，方便检索
- **参数词库** — 沉淀参数、变量和默认值，可导入导出

<img src="./photo/分类-标签-参数页面.gif" alt="分类标签参数" width="860" />

---

### 🌐 资源推荐

- **常用站点** — 汇总即梦、Civitai、LibLib 等入口
- **一键复制** — 复制链接，去浏览器继续逛

---

### ⚙️ 系统设置

- **模型配置** — 多个 AI 接口、模型与 Key；分析 / 反推 / 翻译可各定规则
- **内容分级** — 自动 NSFW、默认模糊、批量校正、速度可调
- **网络代理** — 系统代理 / 手动 / 直连，支持自动检测
- **启动加速** — 按硬件选硬件加速，重启后生效
- **启动图库** — 自定义启动轮播图
- **外观** — 浅色 / 深色一键切换

#### 模型配置

Key 只存在本机并加密保存，不会打进安装包或仓库。

<img src="./photo/API模型设置.gif" alt="API 模型设置" width="860" />

#### NSFW 内容分级

开启后瀑布流默认模糊敏感图，详情可临时看清，也支持批量重校。

<img src="./photo/NSFW分级.gif" alt="NSFW 内容分级" width="860" />

#### 启动图库

安装包默认带 6 张启动图，可换成自己的作品，下次启动生效。

<img src="./photo/启动图库.gif" alt="启动图库" width="860" />

---

## 📥 快速开始

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 / 11（64 位） |
| 磁盘空间 | 按你的图片 / 视频量预留即可 |
| 网络 | 可选；用 AI、解析分享链接时才需要 |

### 安装步骤

1. **下载** [GitHub Releases](https://github.com/guliacer/SuYan/releases) 中的最新安装包（如 `SuYan-Setup-x.y.z.exe`），或便携 ZIP 解压后的 `素言.exe`  
   （软件本身免费；当前版本为 `v0.2.10`，首版 `v0.1.0` 仍独立保留、互不覆盖。若别处收费，请 [举报](https://github.com/guliacer/SuYan/issues)）
2. **安装或打开** 按向导安装，或直接跑便携版
3. **导入素材** 左侧「导入素材」：图片、粘贴、文档或分享包都行  
   （可对照上方 [本地导入](#本地导入) / [网络导入](#网络导入)）
4. **开始整理** 瀑布流里浏览，点进详情改提示词；要用 AI 时再配接口  
   （可对照 [AI 创作助手](#-ai-创作助手) / [模型配置](#模型配置)）

---

## 📝 更新日志

### v0.2.10

**新增功能**

- **目录直挂** — 可把磁盘上已有的图片 / 视频目录挂到库中，不再二次拷贝原始媒体。感谢群友 [@wysl](https://github.com/wysl) 的贡献，详见 [PR #1](https://github.com/guliacer/SuYan/pull/1)
- **内置画布** — 配置 API 后可直接在软件内生成图像
- **默认识别来源** — 分类识别、标签识别可分别指定默认从「提示词」或「效果图」分析，点星标一键切换
- **更多提示词网站** — 新增站点推荐与对应的导入适配
- **更多资源推荐** — 有需要可自行查看

**体验优化**

- **分享功能** — 落实「打包分享」原意，分享包内容更完整
- **数据存放** — 理顺便携版与安装版的数据存放规则
- **分栏菜单** — 修复部分分辨率下无法看到全部分栏菜单的问题
- **拖入归纳** — 优化多张图像拖入时自动归纳为提示词组的逻辑
- **原生弹窗** — 统一各处原生弹窗的样式与交互
- **分类 / 标签** — 重构分类与标签功能，识别更准确、也更易理解
- **AI 提示** — 优化 API 错误提示，增强推理模型（如 GLM、DeepSeek）的识别稳定性
- **技术栈** — 升级项目技术栈，便于后续迭代
- **界面布局** — 优化多处布局细节

**接下来的目标**

1. 现有参数词库不够好用，优化后再次上线
2. 评估纯文本提示词保存功能的必要性
3. 评估在 ComfyUI 中使用的可能性

---

## ❓ 常见问题

<details>
<summary><b>素言收费吗？网上有人卖安装包怎么办？</b></summary>

**A：** 不收费。基于 MIT 开源，软件本身始终免费，没有付费激活或会员。  
若有人卖包、要付费解锁或收「安装服务费」，**请直接举报**，不要付款；优先从 [GitHub Releases](https://github.com/guliacer/SuYan) 下载。  
也欢迎把链接、截图或店铺信息发到 [Issues](https://github.com/guliacer/SuYan/issues)。核实后我们会记入 [收费公示](#-收费公示)，避免更多人上当。

</details>

<details>
<summary><b>素材存在哪？会不会上传到网上？</b></summary>

**A：** 默认都在你本机。日常浏览和编辑不用联网。只有你主动用远程 AI、解析网络分享或下载远程图时，才会发网络请求。

</details>

<details>
<summary><b>如何直接使用磁盘上的图片？</b></summary>

**A：** 左侧「导入素材」→「添加目录」可扫描已有图片和视频目录。素材保留在原目录，应用只保存索引、文件大小/修改时间和缩略图缓存，**不会复制**原始媒体。删除库内条目也不会删除原文件。

每个挂载目录可单独开启「监视此目录」，开关默认关闭。开启后，新增图片或视频会自动建立外链索引；删除只会把条目标记为缺失，不会删除索引或原文件。可唯一识别的重命名会更新相对路径，无法识别时按「旧条目缺失 + 新条目新增」处理；关闭开关后不再自动同步。

也可在「素材目录」中校验、重新定位、增量扫描或移除挂载；重新定位后会按原相对路径批量恢复。

ZIP 分享会只读外链源文件并把媒体内容写入分享包，不要求库内存在副本。外链素材不会参与应用内压缩或转码，也不会被原地覆盖；如需压缩，请先以普通导入方式创建 managed 副本。

</details>

<details>
<summary><b>如何处理源文件缺失的情况？</b></summary>

**A：** 目录断开或磁盘上的文件被移走/删除后，卡片会标记「源文件缺失」（瀑布流与批量管理均会显示）。

- 若文件只是换了位置：在「素材目录」中**重新定位**该挂载，会按原相对路径批量恢复。
- 若原文件已确定不要了、库内只剩缺失索引：打开左侧「素材目录」，在对应目录一行点**清理**按钮（悬停提示为「清理该目录下已删除文件的提示词缓存」）。会一键移除该目录下已缺失文件的提示词索引与应用内缩略图缓存，**不会删除**磁盘上仍存在的原文件，也不影响其他目录。

</details>

<details>
<summary><b>怎么配置 AI？</b></summary>

**A：** 打开左侧「模型配置」，填接口地址、模型和 API Key 后保存。详情页里右键 AI 相关按钮，还能给不同操作换服务商、模型和规则。详见上方 [模型配置](#模型配置)。

</details>

<details>
<summary><b>分享链接解析失败怎么办？</b></summary>

**A：** 先确认网络正常。若站点要代理，到「网络代理」里开启或填写代理，也可以试一下「自动检测」。

</details>

<details>
<summary><b>怎么把素材分享给别人？</b></summary>

**A：** 详情页点「分享」，或在「批量管理」里导出选中的组，把生成的分享包发给对方导入即可。详见上方 [分享包导入](#分享包导入)。

</details>

<details>
<summary><b>NSFW 图片怎么处理？</b></summary>

**A：** 在「内容分级」里打开自动分级和默认模糊。详情里可临时显示或再模糊，也可以批量重校。详见上方 [NSFW 内容分级](#nsfw-内容分级)。

</details>

<details>
<summary><b>视频相关功能不可用？</b></summary>

**A：** 视频卡片、关键帧和视频压缩依赖视频相关能力。请确认已启用；若仍不行，可重装或更新后再试。

</details>

---

## 🚨 收费公示

素言**永久免费**。下列渠道经用户反馈并核实后公示，**请勿在此购买或下载**，以免财产损失或安装到被篡改的版本。

### 如何举报

1. 打开 [GitHub Issues](https://github.com/guliacer/SuYan/issues) 新建反馈
2. 尽量附上：**链接 / 店铺名 / 截图 / 大致收费方式**（售卖安装包、付费激活、「安装服务费」等）
3. 核实后会更新本页名单；情况紧急也可直接在 Issue 里 @ 维护者

> 官方下载请只用 [GitHub Releases](https://github.com/guliacer/SuYan/releases)。未列入名单不代表安全，陌生付费渠道一律不建议。

### 已核实名单

| 渠道 / 店铺 | 大致行为 | 反馈时间 | 备注 |
|-------------|----------|----------|------|
| （暂无） | — | — | 收到并核实后会更新到这里 |

<!--
填写示例（核实后取消注释并改成真实信息）：
| 某网盘分享页 / 某店铺名 | 售卖安装包 / 收取安装服务费 | 2026-07 | 非官方 |
-->

---

## 🤝 参与贡献

欢迎提功能建议、体验反馈和问题报告。

提需求时尽量写清：

1. 你想完成的操作
2. 现在遇到的情况，或期望的结果
3. 能复现的步骤（如果有）

---

## 🙏 致谢

素言使用并感谢以下开源项目。本节列出项目直接依赖、构建 / 测试工具，以及随正式包使用的核心开源组件；具体版本以 [`package.json`](./package.json) 和 [`pnpm-lock.yaml`](./pnpm-lock.yaml) 为准。各项目的版权和许可证归原作者所有，使用时遵循其许可证条款。

### 功能参考与实现来源

下列项目用于功能、交互或底层技术参考。除特别说明外，素言没有直接复制这些项目的源代码；具体实现仍以本仓库代码为准。

| 功能 | 参考 / 使用项目 | 说明 |
| --- | --- | --- |
| 创意画布 | [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) | 画布交互与布局参考 |
| 图像压缩 | [meowtec/Imagine](https://github.com/meowtec/Imagine) | 压缩功能交互参考；实际图像处理由 [Sharp](https://github.com/lovell/sharp) 完成 |
| 图像去重 | [Node.js](https://github.com/nodejs/node) | 当前实现使用 `node:crypto` 的 SHA-256 对文件内容做精确匹配，没有引入独立的第三方图像去重项目 |
| 视频压缩 | [FFmpeg](https://ffmpeg.org/) / [eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | 使用 FFmpeg 编码；FFmpeg 二进制在首次用到视频功能时按需下载并验签安装，不再随包分发 |

### 运行时与核心能力

| 项目 | 在素言中的用途 | 许可证 | 项目地址 |
| --- | --- | --- | --- |
| [Electron](https://github.com/electron/electron) | 跨平台桌面运行时 | MIT | [electron/electron](https://github.com/electron/electron) |
| [Node.js](https://github.com/nodejs/node) | Electron 提供的主进程 Node API | MIT | [nodejs/node](https://github.com/nodejs/node) |
| [React / React DOM](https://github.com/facebook/react) | 界面渲染与组件体系 | MIT | [facebook/react](https://github.com/facebook/react) |
| [Zustand](https://github.com/pmndrs/zustand) | 渲染层状态管理 | MIT | [pmndrs/zustand](https://github.com/pmndrs/zustand) |
| [Lucide](https://github.com/lucide-icons/lucide) | 界面图标（`lucide-react`） | ISC | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| [JSZip](https://github.com/Stuk/jszip) | ZIP 分享包、日志包和文档读取 | MIT / GPL-3.0-or-later | [Stuk/jszip](https://github.com/Stuk/jszip) |
| [Sharp](https://github.com/lovell/sharp) | 图片压缩、缩略图和图像处理 | Apache-2.0 | [lovell/sharp](https://github.com/lovell/sharp) |
| [libvips](https://github.com/libvips/libvips) | Sharp 使用的高性能图像处理底层库 | LGPL-3.0-or-later | [libvips/libvips](https://github.com/libvips/libvips) |
| [Chokidar](https://github.com/paulmillr/chokidar) | 外部素材目录监视 | MIT | [paulmillr/chokidar](https://github.com/paulmillr/chokidar) |
| [uuid](https://github.com/uuidjs/uuid) | 素材和数据记录的唯一 ID | MIT | [uuidjs/uuid](https://github.com/uuidjs/uuid) |
| [FFmpeg](https://ffmpeg.org/) | 视频压缩、关键帧处理；二进制按需下载验签安装（`ffmpeg-static` 仅用于构建期开发与测试） | GPL-3.0-or-later | [ffmpeg.org](https://ffmpeg.org/) |

### 构建、测试与发布工具

| 项目 | 在素言中的用途 | 许可证 | 项目地址 |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | 渲染层开发与构建 | MIT | [vitejs/vite](https://github.com/vitejs/vite) |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | Vite 的 React 编译插件 | MIT | [vitejs/vite-plugin-react](https://github.com/vitejs/vite-plugin-react) |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) / `@tailwindcss/vite` | 样式系统与 Vite 集成 | MIT | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) |
| [TypeScript](https://github.com/microsoft/TypeScript) | 类型检查与 Electron 构建 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| [Vitest](https://github.com/vitest-dev/vitest) | 单元测试与回归验证 | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| [electron-builder](https://github.com/electron-userland/electron-builder) | Windows 安装包和便携包构建 | MIT | [electron-userland/electron-builder](https://github.com/electron-userland/electron-builder) |
| [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) | 正式包 Electron 代码保护 | BSD-2-Clause | [javascript-obfuscator/javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | `@types/node`、`@types/react` 和 `@types/react-dom` 类型声明 | MIT | [DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [Go](https://github.com/golang/go) | 构建文件复制 helper（仅使用标准库） | BSD-3-Clause | [golang/go](https://github.com/golang/go) |
| [pnpm](https://github.com/pnpm/pnpm) | 依赖安装和锁文件管理 | MIT | [pnpm/pnpm](https://github.com/pnpm/pnpm) |

## 免责声明

本项目基于 [MIT License](./LICENSE) 开源，**永久免费**，仅供学习与个人创作整理使用。请遵守相关法律法规，合理使用 AI 生成内容；使用过程中的风险由使用者自行承担。

如果这个项目对你有帮助，欢迎点一颗 ⭐，或转给同样需要管理提示词的朋友。

### Buy me a coffee ~

软件本身不收费。若愿意请作者喝杯咖啡，可扫下方收款码（完全自愿，不影响任何功能）：

<div align="center">

<table>
  <tr>
    <td align="center" width="280">
      <img src="./photo/赞助-微信.png" alt="微信赞助" width="180" />
      <br/>
      <sub>微信</sub>
    </td>
    <td width="48"></td>
    <td align="center" width="280">
      <img src="./photo/赞助-支付宝.jpg" alt="支付宝赞助" width="180" />
      <br/>
      <sub>支付宝</sub>
    </td>
  </tr>
</table>

</div>

---

<div align="center">

**Made with ❤️ by 素言 SuYan**

</div>
