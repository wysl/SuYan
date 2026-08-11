<div align="center">

# SuYan 素言

[简体中文](./README.md) | **English**

**Local AI prompt & image library manager**

Keep your artwork and prompts together — find, edit, and take them anywhere

[GitHub](https://github.com/guliacer/SuYan) · [Highlights](#-highlights) · [Features](#-features) · [Quick start](#-quick-start) · [Changelog](#-changelog) · [FAQ](#-faq) · [Paid listings](#-paid-listings) · [Acknowledgements](#-acknowledgements)

**Forever free · Open source · Report paid resellers via [Issues](https://github.com/guliacer/SuYan/issues)**

<br/>

<img src="./photo/界面展示.gif" alt="SuYan overview" width="860" />

<p><sub>
<strong>Main window at a glance:</strong> left nav for library, import, lexicons, and settings; center masonry cards bind artwork with prompt summaries.
Adjust columns, search titles or prompts, filter by category / tag / favorites, sort by time, size, or random.
Open a card to edit, copy, or share.
</sub></p>

</div>

> 💚 **SuYan is always free.**  
> MIT-licensed open source — no app fees, no paid unlock, no membership.  
> If someone sells the installer or charges an “install fee”, **report it**, do not pay, and download from [GitHub](https://github.com/guliacer/SuYan).  
> Send links, screenshots, or shop names via [Issues](https://github.com/guliacer/SuYan/issues). Verified cases appear in [Paid listings](#-paid-listings).

---

## ✨ Highlights

> **SuYan** keeps artwork, positive/negative prompts, categories, tags, and replaceable terms in one local library — searchable, reusable, and easy to share.

- 🗂️ **Local first** — data stays on your machine; no cloud account required
- 🖼️ **Image + prompt together** — browse, edit, copy, and share in one flow
- ✨ **AI when you need it** — split parameters, expand terms, reverse-prompt, translate, optimize; works offline without AI
- 🧹 **Easy cleanup** — compress, dedupe, batch import/export

---

## 🚀 Features

Browse in everyday order. Each section lists capabilities, then shows a demo GIF.

### 🏠 Library browse

- **Masonry gallery** — card view for image / video prompts; column count adjustable
- **Full-text search** — title, filename, prompt text, or tags
- **Filter & sort** — category, tag, favorites; by import / modified time, size, or random
- **Favorites** — star items and view them alone

<img src="./photo/界面展示.gif" alt="Library browse" width="860" />

---

### 📥 Import

- **Import images** — batch add local files
- **Mount folders** — index existing image / video folders without copying the source media
- **Paste** — clipboard images go straight in
- **Import documents** — extract images and prompts from Word
- **Import shares** — ZIP packages or shared web links

#### Local import

Left sidebar **Import** → **Import images**, multi-select local files; paste and Word import also work.

<img src="./photo/本地素材导入.gif" alt="Local import" width="860" />

#### Network import

Paste a share link; SuYan downloads remote images and prompts. Configure **Network proxy** first if the site needs it.

<img src="./photo/网络素材导入.gif" alt="Network import" width="860" />

#### Share package

Export a ZIP (images + prompts) from detail or **Batch manage**; the other side uses **Import share** — no account required.

<img src="./photo/分享与导入.gif" alt="Share and import" width="860" />

---

### 🗂️ Batch manage

- **Unified list** — group counts and tag overview
- **Batch export / import** — export selected groups or import packages
- **Batch delete** — multi-select with confirmation
- **Image compress** — original format or WebP; quality adjustable
- **Video compress** — choose target resolution
- **Dedupe** — scan duplicates, keep one copy

<img src="./photo/去重-压缩.gif" alt="Dedupe and compress" width="860" />

---

### 📝 Prompt detail

- **Side-by-side** — artwork with positive / negative prompts
- **Copy / share** — clipboard or share package
- **Category & tags** — manual or AI suggestions
- **Model notes** — record how it was generated
- **Multi-image** — several artworks per prompt group

Open any masonry card to enter detail.

---

### ✨ AI assistant

- **Parameter analysis** — long prompts become clickable capsules
- **AI terms** — similar replaceable candidates for the current parameter
- **Prompt polish** — restructure by rules for better control
- **EN / ZH translate** — keep parameter structure where possible
- **Image reverse prompt** — generate a full prompt from artwork
- **Rule presets** — different providers / models / rules per action; right-click to switch

<img src="./photo/AI分析操作指引.gif" alt="AI analysis" width="860" />

> Configure an API under **Model settings** first. Local browse and edit work without AI.

---

### 🎬 Video prompts

- **Video cards** — cover and duration
- **Keyframe timeline** — one-click keyframes for pacing review
- **References** — import reference images / audio from file, clipboard, or link

---

### 📚 Lexicons

- **Categories** — groups, notes, cover images
- **Tags** — consistent naming for search
- **Parameter lexicon** — parameters, variables, defaults; import / export

<img src="./photo/分类-标签-参数页面.gif" alt="Lexicons" width="860" />

---

### 🌐 Resource links

- **Site shortcuts** — Jimeng, Civitai, LibLib, and more
- **Copy URL** — open in your browser

---

### ⚙️ Settings

- **Model settings** — multiple APIs, models, keys; per-action rules
- **Content rating** — auto NSFW, default blur, batch regrade, speed control
- **Network proxy** — system / manual / direct; auto-detect
- **Startup acceleration** — hardware acceleration (restart required)
- **Startup gallery** — custom splash carousel
- **Appearance** — light / dark theme

#### Model settings

Keys stay on your machine and are encrypted; they are never baked into the installer or repo.

<img src="./photo/API模型设置.gif" alt="API model settings" width="860" />

#### NSFW rating

Sensitive cards blur in the masonry by default; temporary reveal in detail; batch regrade supported.

<img src="./photo/NSFW分级.gif" alt="NSFW rating" width="860" />

#### Startup gallery

Six default splash images ship with the app; replace them with your own for next launch.

<img src="./photo/启动图库.gif" alt="Startup gallery" width="860" />

---

## 📥 Quick start

### Requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10 / 11 (64-bit) |
| Disk | Enough space for your images / videos |
| Network | Optional; needed for AI and share-link parsing |

### Install

1. **Download** the latest installer from [GitHub Releases](https://github.com/guliacer/SuYan/releases) (e.g. `SuYan-Setup-x.y.z.exe`), or portable ZIP then run `素言.exe`  
   (Free software. Current version is `v0.2.10`; first release `v0.1.0` remains separate and is not overwritten. Report paid resellers via [Issues](https://github.com/guliacer/SuYan/issues).)
2. **Install or open** via the wizard, or run the portable build
3. **Import** images, paste, documents, or share packages from the left sidebar  
   (see [Local import](#local-import) / [Network import](#network-import))
4. **Organize** in the masonry; open detail to edit prompts; configure AI when ready  
   (see [AI assistant](#-ai-assistant) / [Model settings](#model-settings))

---

## 📝 Changelog

### v0.2.10

**New**

- **Mount folders directly** — attach existing image / video folders on disk to your library without copying the originals again. Thanks to community member [@wysl](https://github.com/wysl) — see [PR #1](https://github.com/guliacer/SuYan/pull/1)
- **Built-in canvas** — generate images right inside the app once an API is configured
- **Default recognition source** — choose whether category / tag recognition analyzes the "prompt" or the "artwork" by default, switchable with one star click
- **More prompt sites** — added site recommendations with matching import adapters
- **More resource picks** — browse them whenever you need

**Improved**

- **Sharing** — delivers on the "packaged share" intent; share packages are more complete
- **Data storage** — cleaner rules for where portable and installer builds keep data
- **Column menus** — fixed menus that were cut off at some resolutions
- **Drag-to-group** — smarter grouping when dropping multiple images into a prompt group
- **Native dialogs** — unified the look and behavior of native dialogs across the app
- **Category / tags** — reworked category and tag features for more accurate, easier-to-understand results
- **AI feedback** — clearer API error messages and steadier recognition on reasoning models (e.g. GLM, DeepSeek)
- **Tech stack** — upgraded the stack for smoother future iteration
- **Layout** — refined many layout details

**Roadmap**

1. The current parameter lexicon isn't good enough yet — it will return after a rework
2. Evaluating whether plain-text prompt saving is worth keeping
3. Evaluating ComfyUI integration

---

## ❓ FAQ

<details>
<summary><b>Is SuYan paid? What if someone sells the installer?</b></summary>

**A:** No. MIT open source, always free — no paid unlock or membership.  
If someone sells packages or charges install fees, **report it**, do not pay; download from [GitHub Releases](https://github.com/guliacer/SuYan/releases).  
Send evidence to [Issues](https://github.com/guliacer/SuYan/issues). Verified cases go to [Paid listings](#-paid-listings).

</details>

<details>
<summary><b>Where is my library? Is it uploaded?</b></summary>

**A:** On your machine by default. Browse and edit offline. Network is used only when you call remote AI, parse share links, or download remote images.

</details>

<details>
<summary><b>How do I use images already on disk?</b></summary>

**A:** Left sidebar **Import** → **Add folder** scans existing image/video folders. Media stays in place; the app only stores indexes, size/mtime, and thumbnail cache — it does **not** copy source media. Deleting a library entry does not delete the original file.

Each mounted folder can enable **Watch this folder** (off by default). While enabled, new media is indexed automatically; removals are marked missing without deleting the index or source files. Uniquely identifiable renames update the stored relative path; otherwise it becomes "old entry missing + new entry added". Turning watching off stops automatic synchronization.

You can also validate, re-locate, incrementally rescan, or unmount from **Material folders**. After re-locating, items recover by original relative paths.

ZIP shares read external sources and embed media into the package (no in-library copy required). External items are not compressed/transcoded in-app and are never overwritten in place; create a managed copy via normal import first if you need compression.

</details>

<details>
<summary><b>How do I handle missing source files?</b></summary>

**A:** If a mount is disconnected or files were moved/deleted on disk, cards show **source missing** (both masonry and batch manage).

- If files only moved: **re-locate** the mount under **Material folders** to restore by relative paths.
- If the originals are gone for good and only missing indexes remain: open **Material folders**, then use the **clean** action on that folder row (tooltip: clear prompt indexes for deleted files under this folder). It removes missing-file indexes and app thumbnail cache for that root only — it does **not** delete remaining files on disk or affect other folders.

</details>

<details>
<summary><b>How do I configure AI?</b></summary>

**A:** Open **Model settings**, add endpoint, model, and API key. Right-click AI actions in detail to switch provider / model / rules. See [Model settings](#model-settings).

</details>

<details>
<summary><b>Share link parsing failed?</b></summary>

**A:** Check the network. If the site needs a proxy, enable or enter one under **Network proxy**, or try auto-detect.

</details>

<details>
<summary><b>How do I share with others?</b></summary>

**A:** Use **Share** in detail, or export selected groups in **Batch manage**. See [Share package](#share-package).

</details>

<details>
<summary><b>How is NSFW handled?</b></summary>

**A:** Enable auto rating and default blur under **Content rating**. Temporary reveal in detail; batch regrade supported. See [NSFW rating](#nsfw-rating).

</details>

<details>
<summary><b>Video features unavailable?</b></summary>

**A:** Video cards, keyframes, and video compress need video support. Confirm it is enabled; reinstall or update if needed.

</details>

---

## 🚨 Paid listings

SuYan is **forever free**. Channels below were reported and verified — **do not buy or download there**.

### How to report

1. Open a new [GitHub Issue](https://github.com/guliacer/SuYan/issues)
2. Include **link / shop name / screenshot / how they charge** when possible
3. Verified entries are listed here

> Official downloads: [GitHub Releases](https://github.com/guliacer/SuYan/releases) only. Absence from this list does not mean a third-party channel is safe.

### Verified list

| Channel / shop | Behavior | Reported | Notes |
|----------------|----------|----------|-------|
| (none yet) | — | — | Will update after verification |

---

## 🤝 Contributing

Feature ideas, UX feedback, and bug reports are welcome.

Please include when possible:

1. What you wanted to do
2. What happened vs what you expected
3. Repro steps (if any)

---

## 🙏 Acknowledgements

SuYan uses and thanks the open-source projects below. This section lists direct dependencies, build/test tools, and the core open-source components used by the packaged application; exact versions are tracked in [`package.json`](./package.json) and [`pnpm-lock.yaml`](./pnpm-lock.yaml). Copyright and licensing remain with the respective authors, and each project is used under its own license.

### Feature references and implementation sources

The projects below informed feature, interaction, or low-level technology choices. Unless stated otherwise, SuYan does not copy their source code; the implementation in this repository is authoritative.

| Feature | Reference / project used | Notes |
| --- | --- | --- |
| Creative canvas | [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) | Canvas interaction and layout reference |
| Image compression | [meowtec/Imagine](https://github.com/meowtec/Imagine) | Compression UX reference; actual image processing uses [Sharp](https://github.com/lovell/sharp) |
| Image deduplication | [Node.js](https://github.com/nodejs/node) | The current implementation uses `node:crypto` SHA-256 exact file-content matching; no separate third-party image-deduplication project is bundled |
| Video compression | [FFmpeg](https://ffmpeg.org/) / [eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | FFmpeg encoding; the FFmpeg binary is downloaded on demand, signature-verified, and installed on first use of video features — no longer bundled with the app |

### Runtime and core capabilities

| Project | Use in SuYan | License | Project |
| --- | --- | --- | --- |
| [Electron](https://github.com/electron/electron) | Cross-platform desktop runtime | MIT | [electron/electron](https://github.com/electron/electron) |
| [Node.js](https://github.com/nodejs/node) | Main-process Node APIs provided by Electron | MIT | [nodejs/node](https://github.com/nodejs/node) |
| [React / React DOM](https://github.com/facebook/react) | UI rendering and components | MIT | [facebook/react](https://github.com/facebook/react) |
| [Zustand](https://github.com/pmndrs/zustand) | Renderer state management | MIT | [pmndrs/zustand](https://github.com/pmndrs/zustand) |
| [Lucide](https://github.com/lucide-icons/lucide) | UI icons (`lucide-react`) | ISC | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| [JSZip](https://github.com/Stuk/jszip) | ZIP shares, log packages, and document reads | MIT / GPL-3.0-or-later | [Stuk/jszip](https://github.com/Stuk/jszip) |
| [Sharp](https://github.com/lovell/sharp) | Image compression, thumbnails, and processing | Apache-2.0 | [lovell/sharp](https://github.com/lovell/sharp) |
| [libvips](https://github.com/libvips/libvips) | High-performance image layer used by Sharp | LGPL-3.0-or-later | [libvips/libvips](https://github.com/libvips/libvips) |
| [Chokidar](https://github.com/paulmillr/chokidar) | External material-folder watching | MIT | [paulmillr/chokidar](https://github.com/paulmillr/chokidar) |
| [uuid](https://github.com/uuidjs/uuid) | Unique IDs for materials and records | MIT | [uuidjs/uuid](https://github.com/uuidjs/uuid) |
| [FFmpeg](https://ffmpeg.org/) | Video compression and keyframes; the binary is downloaded, signature-verified, and installed on demand (`ffmpeg-static` is used only for build-time development and testing) | GPL-3.0-or-later | [ffmpeg.org](https://ffmpeg.org/) |

### Build, test, and release tooling

| Project | Use in SuYan | License | Project |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | Renderer development and builds | MIT | [vitejs/vite](https://github.com/vitejs/vite) |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React compiler plugin for Vite | MIT | [vitejs/vite-plugin-react](https://github.com/vitejs/vite-plugin-react) |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) / `@tailwindcss/vite` | Styling system and Vite integration | MIT | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) |
| [TypeScript](https://github.com/microsoft/TypeScript) | Type checking and Electron builds | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| [Vitest](https://github.com/vitest-dev/vitest) | Unit tests and regression checks | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| [electron-builder](https://github.com/electron-userland/electron-builder) | Windows installer and portable builds | MIT | [electron-userland/electron-builder](https://github.com/electron-userland/electron-builder) |
| [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) | Electron code protection for release builds | BSD-2-Clause | [javascript-obfuscator/javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | `@types/node`, `@types/react`, and `@types/react-dom` declarations | MIT | [DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [Go](https://github.com/golang/go) | Builds the file-copy helper (standard library only) | BSD-3-Clause | [golang/go](https://github.com/golang/go) |
| [pnpm](https://github.com/pnpm/pnpm) | Dependency installation and lockfile management | MIT | [pnpm/pnpm](https://github.com/pnpm/pnpm) |

## Disclaimer

This project is open source under the [MIT License](./LICENSE), **forever free**, for learning and personal creative organization. Follow applicable laws; use AI-generated content responsibly. You assume the risk of use.

If SuYan helps you, a ⭐ or a share with friends is appreciated.

### Buy me a coffee ~

The app is free. Optional tips keep development going (no effect on features):

<div align="center">

<table>
  <tr>
    <td align="center" width="280">
      <img src="./photo/赞助-微信.png" alt="WeChat tip" width="180" />
      <br/>
      <sub>WeChat</sub>
    </td>
    <td width="48"></td>
    <td align="center" width="280">
      <img src="./photo/赞助-支付宝.jpg" alt="Alipay tip" width="180" />
      <br/>
      <sub>Alipay</sub>
    </td>
  </tr>
</table>

</div>

---

<div align="center">

**Made with ❤️ by SuYan 素言**

</div>
