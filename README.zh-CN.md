<h1 align="center">Video Workflow for Codex｜通用视频工作流</h1>

<p align="center"><strong>把锁定逐字稿制作成配音、字幕、动画严格同步，并经过自动质检的视频成片。</strong></p>

<p align="center">中文 · <a href="README.md">English</a></p>

这是一个面向 Codex 的开源社区插件。它处理视频生产中最容易返工的部分：逐字稿锁定、内容模板、配音任务、真实音频时间线、逐字字幕、动画节奏、响度统一、逐帧渲染和导出前质检。

```text
锁定逐字稿
  → 选择内容类型、尺寸和主题
  → 配音与配图任务
  → 按真实音频建立时间线
  → 字幕与动画读取同一组 cue
  → Chromium 逐帧渲染 + FFmpeg 合成
  → 自动质检
  → 最终 MP4
```

项目不依赖 HyperFrames，也不依赖 Remotion。

## 支持的内容类型

| 类型 | 适合内容 |
| --- | --- |
| `explainer` | 知识科普、概念和术语解释 |
| `listicle` | Skill、工具、榜单和推荐清单 |
| `workflow` | 教程、SOP 和流程拆解 |
| `comparison` | A/B 对比、前后变化和选择建议 |
| `promo` | 产品功能、发布介绍和广告视频 |
| `data-story` | 数据、趋势、GitHub 活跃度和报告 |

尺寸支持横版 `1920×1080`、竖版 `1080×1920` 和社交平台 `1080×1350`。视觉主题包括手绘白板、编辑部、科技和产品发布会风格。

## 核心能力

- 字幕与旁白读取同一份锁定 cue，禁止另写字幕。
- 场景时长由真实音频决定，不靠字数估算。
- 动画按旁白 cue 入场，口播结束后停止无效运动。
- 对句内音量动态均衡，并统一 LUFS 与真峰值。
- 自动检查文案哈希、音频哈希、字幕漂移、cue 顺序、场景空白、素材、尺寸和最终时长。
- 每期创建独立目录，不覆盖旧项目或旧成片。
- 公开仓库不包含私人音色、人物母图、模型权重、密钥或生成成片。

## 通用配音层

默认使用操作系统已经安装的 TTS 声音，不要求账号。用户也可以显式选择自己的音频、OpenAI、ElevenLabs 或 OpenAI-compatible 接口。付费服务不会被静默调用。

所有音频最后统一转换成 48 kHz 单声道 WAV，再进行时间线测量和响度处理。Kokoro、CosyVoice、Piper 等本地引擎可以通过文件或兼容接口接入，但不会作为默认依赖打包。

## 环境要求

- Node.js 20 或更高版本
- Chrome、Chromium 或 Edge
- macOS、Windows 或 Linux

FFmpeg、ffprobe、GSAP 和 Puppeteer Core 通过锁定依赖安装。

## 安装 Codex 插件

```bash
codex plugin marketplace add swping999/video-workflow-for-codex --ref main
codex plugin add video-workflow@swping999-video
```

新建 Codex 任务后可以直接说：

```text
使用 $video-workflow，把这份锁定逐字稿制作成经过校验的竖版清单视频。
```

Skill 会先运行 `doctor`。如果缺少运行依赖，Codex 会在解析出的插件目录中按锁定文件安装，然后才继续制作。

## 手动运行

```bash
(cd plugins/video-workflow/runtime && npm ci)

PLUGIN=plugins/video-workflow
$PLUGIN/scripts/video-workflow doctor
$PLUGIN/scripts/video-workflow create \
  --script examples/demo-script.txt \
  --output /tmp/demo-video \
  --slug demo-video \
  --type listicle \
  --format portrait \
  --theme editorial
$PLUGIN/scripts/video-workflow export --project /tmp/demo-video
$PLUGIN/scripts/video-workflow synthesize --project /tmp/demo-video --provider system
$PLUGIN/scripts/video-workflow process-audio --project /tmp/demo-video
$PLUGIN/scripts/video-workflow verify --project /tmp/demo-video
$PLUGIN/scripts/video-workflow render --project /tmp/demo-video --quality high
```

成片位于 `renders/final.mp4`，渲染报告位于 `renders/render-report.json`。

## 项目定位

这是一个为 Codex 制作的独立社区插件，不是 OpenAI 官方插件，也不是自行训练的文生视频大模型。它负责把现有系统能力或用户选择的媒体服务组织成一条可复现、可验证的视频生产线。

代码使用 MIT License，运行依赖保留各自许可证。更多说明见 [安全政策](SECURITY.md)、[贡献指南](CONTRIBUTING.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。
