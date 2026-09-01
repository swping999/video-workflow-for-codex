<h1 align="center">Video Workflow for Codex｜一句话生成视频</h1>

<p align="center"><strong>用户只说一句需求，Codex 自动拆解流程，再用完全免费的本地生产链生成同步、可校验的 MP4 成片。</strong></p>

<p align="center">中文 · <a href="README.md">English</a></p>

很多 AI 视频演示最后只给出脚本或几张零散素材。这个 Codex 社区插件会继续完成配音、字幕、动画、音频处理、质检和渲染。默认路径不需要媒体 API Key、付费配音、付费生图账号、HyperFrames 或 Remotion。

```text
用户一句话
  → Codex 判断内容类型、尺寸、主题、场景和脚本
  → 锁定原始需求与生成文案
  → 操作系统免费配音
  → 内置图形、卡片、排版和 GSAP 动画
  → 按真实音频建立时间线，字幕与旁白同源
  → 响度处理与自动质检
  → Chromium 逐帧渲染 + FFmpeg
  → 最终 MP4
```

## 只需要说一句话

安装后，新建一个 Codex 任务，直接说：

```text
使用 $video-workflow，做一个讲 MCP 的竖版白板科普视频。
```

Codex 会自动补全这句话里没有写出的制作决策：

- 选择科普、清单、流程、对比、推广或数据故事结构；
- 判断横版、竖版或 4:5 社交平台尺寸；
- 写出完整分场景文案并锁定；
- 让配音、字幕、画面与动画读取同一份内容；
- 渲染 MP4，并返回质检指纹。

常规制作选项不会反复追问。只有歧义会明显改变事实、人物身份或目标结果时，Codex 才需要确认。

## 全免费核心路径

- **配音：**macOS 使用 `say`，Windows 使用 `System.Speech`，Linux 使用免费的 `espeak-ng`。
- **画面：**代码生成排版、图形、卡片、箭头、形状和 GSAP 动效。
- **视频：**使用电脑已有的 Chrome、Chromium 或 Edge，再由 FFmpeg 完成合成。
- **账号：**不需要配音账号、生图账号、媒体 API Key 或云媒体服务。
- **隐私：**默认生成过程不会把文案或声音发送到云端媒体接口。

用户仍然可以放入自己有权使用的本地音频，但运行时不包含付费服务适配器。项目会导出可选配图提示词，方便有需要的人自行加素材；不生成这些图也能完成整支视频。

## 支持的内容类型

| 类型 | 适合内容 |
| --- | --- |
| `explainer` | 知识科普、概念和术语解释 |
| `listicle` | Skill、工具、榜单和推荐清单 |
| `workflow` | 教程、SOP 和流程拆解 |
| `comparison` | A/B 对比、前后变化和选择建议 |
| `promo` | 产品功能、发布介绍和广告视频 |
| `data-story` | 数据、趋势、GitHub 活跃度和报告 |

尺寸支持横版 `1920×1080`、竖版 `1080×1920` 和社交平台 `1080×1350`。主题包括 `whiteboard`、`editorial`、`tech` 和 `product`。

## 同步与质检规则

- 字幕与旁白读取同一份锁定 cue，不另写一份字幕。
- 场景时长由处理后的真实音频决定，不按字数猜。
- 动画跟随旁白 cue 入场，口播结束后停止无效运动。
- 每条音频执行动态均衡，场景响度目标约 -16 LUFS、峰值约 -1.5 dBTP。
- 自动检查文案哈希、音频哈希、字幕漂移、cue 顺序、场景空白、尺寸、素材和最终时长。
- 每期创建独立目录，不覆盖旧项目或旧成片。
- 公开仓库不包含私人音色、人物身份、模型权重、密钥或生成成片。

## 环境要求

- Node.js 20 或更高版本
- Chrome、Chromium 或 Edge
- macOS、Windows 或 Linux
- Linux 的一键配音路径需安装 `espeak-ng`

FFmpeg、ffprobe、GSAP 和 Puppeteer Core 通过锁定依赖安装。

## 安装 Codex 插件

```bash
codex plugin marketplace add swping999/video-workflow-for-codex --ref main
codex plugin add video-workflow@swping999-video
```

安装后新建一个 Codex 任务，让 Skill 重新载入。

## 手动一键生成

Codex 会先生成脚本，再调用确定性运行时。命令会同时记录原始需求和生成脚本：

```bash
(cd plugins/video-workflow/runtime && npm ci)

PLUGIN=plugins/video-workflow
$PLUGIN/scripts/video-workflow build \
  --brief "做一个讲 MCP 的竖版科普视频" \
  --script examples/demo-script.txt \
  --output /tmp/mcp-video \
  --slug mcp-video \
  --type explainer \
  --format portrait \
  --theme whiteboard \
  --quality high
```

成片位于 `renders/final.mp4`，渲染报告位于 `renders/render-report.json`。

## 主要文件

| 文件 | 用途 |
| --- | --- |
| `brief.locked.txt` | 一句话模式中的原始用户需求 |
| `script.locked.txt` | Codex 生成或用户确认的逐字稿 |
| `story-source.json` | 文案、画面、配音、尺寸和主题的唯一结构化来源 |
| `.media/audio-request.json` | 精确到 cue 的配音任务 |
| `.media/image-prompts.json` | 可选配图任务，不是免费核心的必需项 |
| `assets/voice-manifest.json` | 音频哈希、时长、响度、峰值和主音轨 |
| `story.js` | 渲染器读取的真实时间线 |
| `renders/final.mp4` | 通过校验的最终成片 |

## 项目定位

这是一个为 Codex 制作的独立社区插件，不是 OpenAI 官方插件，也不是新训练的文生视频模型。它提供自己的生产工作流和确定性浏览器逐帧渲染，不依赖 HyperFrames 或 Remotion。

代码使用 MIT License，运行依赖保留各自许可证。更多说明见 [安全政策](SECURITY.md)、[贡献指南](CONTRIBUTING.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。
