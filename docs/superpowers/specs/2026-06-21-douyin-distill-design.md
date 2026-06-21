# Douyin Distill — 抖音博主 Agent 蒸馏工具设计

## 概述

独立 CLI 工具，从抖音博主视频中蒸馏出 Agent 配置。三步管线：视频下载 → 语音转文字 → LLM 蒸馏 → 输出 AgentTrade 兼容的 YAML。

### 核心目标

- **人格复刻**：捕捉博主的说话风格、语气、思维模式
- **知识提取**：提取博主的方法论、分析框架、专业知识
- **独立解耦**：纯 CLI 工具，独立仓库，不在 AgentTrade monorepo 内
- **输出即用**：产物可直接注入 AgentTrade 的 AgentRegistry

## 架构概览

```
┌────────────────────────────────────────────────────┐
│                    CLI 层 (commander.js)              │
│         npx douyin-distill --handle @博主ID           │
├────────────────────────────────────────────────────┤
│                  管线编排 (pipeline.ts)               │
│  Step 1 ─→ Step 2 ─→ Step 3 ─→ Step 4 ─→ Step 5    │
│  拉列表     下载视频   提取音频   语音转文   LLM蒸馏    │
├──────────────────┬─────────────────────────────────┤
│  外部二进制依赖    │         LLM 抽象层                │
│  ffmpeg          │   DeepSeek / OpenAI / Anthropic  │
│  whisper.cpp     │   prompts/ 目录管理提示词          │
├──────────────────┴─────────────────────────────────┤
│                文件系统状态存储                        │
│  ~/.douyin-distill/state/ | videos/ | transcripts/  │
└────────────────────────────────────────────────────┘
```

## 项目结构

```
douyin-distill/
├── src/
│   ├── index.ts              # CLI 入口 (commander.js)
│   ├── pipeline.ts           # 管线编排器
│   ├── steps/
│   │   ├── fetch-list.ts     # 获取博主视频列表
│   │   ├── download.ts       # 下载视频
│   │   ├── extract-audio.ts  # ffmpeg 提取音频
│   │   ├── transcribe.ts     # whisper.cpp 语音转文字
│   │   └── distill.ts        # LLM 蒸馏 (两阶段)
│   ├── storage/
│   │   ├── state.ts           # 文件状态读写
│   │   └── cache.ts          # 文件缓存判断
│   ├── llm/
│   │   ├── client.ts         # LLM 抽象层
│   ├── types.ts
│   └── utils.ts
├── prompts/
│   ├── stage1-knowledge.md   # Stage 1 知识提取提示词
│   ├── stage1-persona.md     # Stage 1 人格采样提示词
│   └── stage2-merge.md       # Stage 2 汇聚合成提示词
├── test/
│   ├── unit/                  # 每步独立单元测试
│   ├── fixtures/              # 固定输入输出样本
│   └── e2e/                   # 端到端管线测试
├── package.json
├── tsconfig.json
└── README.md
```

## 技术选型

| 层 | 技术 | 理由 |
|----|------|------|
| 运行时 | Node.js 18+ / TypeScript | 并行 I/O 天然优势，和 AgentTrade 同语言 |
| CLI | commander.js + chalk + ora | 轻量，零学习成本 |
| HTTP | 内置 fetch (Node 18+) | 零依赖 |
| 音频提取 | ffmpeg (外部二进制) | 工业标准，用户自行安装 |
| 语音转写 | whisper.cpp (外部二进制) | 纯 C，零 Python 依赖，small 模型 CPU 可用 |
| LLM | OpenAI 兼容 API | 兼容 DeepSeek/OpenAI/Anthropic |
| 状态存储 | 文件系统 (JSON + TSV) | 零依赖，人类可读，可 grep/awk 调试 |

## 本地存储布局

```
~/.douyin-distill/
├── state/
│   ├── {handle}.json          # 博主级别元数据
│   └── {handle}.tsv           # 视频清单 + 每步状态
├── videos/{video_id}.mp4      # 下载的视频
├── audio/{video_id}.wav       # 16kHz mono WAV
├── transcripts/{video_id}.txt # 转录文本
├── nuggets/{video_id}.md      # Stage 1 蒸馏中间产物
├── output/{handle}.yaml       # 最终 Agent 配置
└── models/ggml-small.bin     # whisper 模型（首次自动下载）
```

### `{handle}.json` 结构

```json
{
  "handle": "@博主ID",
  "lastFetch": "2026-06-21T10:00:00Z",
  "totalVideos": 156,
  "distilledAt": "2026-06-21T12:30:00Z",
  "outputHash": "abc123"
}
```

### `{handle}.tsv` 结构

```
video_id         title           duration  downloaded  transcribed  nugget
7123456789abc    A股下周怎么走     05:23     true        true         true
6987654321def    这个板块要爆发     08:15     true        false        false
```

## 管线详情

### Step 1 — 获取视频列表 (fetch-list)

- 调用 Douyin_TikTok_Download_API 的 `/user/posts` 接口
- 分页循环拉到底，写入 `{handle}.tsv`
- 增量模式 (`--update`)：只拉 `lastFetch` 之后的新视频

### Step 2 — 下载视频 (download)

- 并发下载（`--concurrency`，默认 5）
- 文件存在即跳过
- 失败重试 3 次，指数退避
- 调用 Douyin_TikTok_Download_API 下载接口

### Step 3 — 提取音频 (extract-audio)

- 命令：`ffmpeg -i video.mp4 -ac 1 -ar 16000 -f wav audio.wav`
- 16kHz 单声道 WAV，whisper.cpp 要求格式
- 文件存在跳过

### Step 4 — 转写 (transcribe)

- 命令：`whisper -m models/ggml-small.bin -f audio.wav -l zh -otxt`
- 输出到 `transcripts/{video_id}.txt`
- `--asr-cloud openai` 可切换云端加速
- 默认使用 small 模型，`--asr-model` 可选 tiny/small/medium

### Step 5 — LLM 蒸馏 (distill)

两阶段设计：

**Stage 1：逐视频提取（并行）**
- 每个视频转录 → LLM → nugget（知识 + 人格采样）
- 并发数可配置
- 输出 `nuggets/{video_id}.md`

**Stage 2：汇聚合成（单次调用）**
- 所有 nugget 汇总 + 时间衰减权重 → LLM → Agent YAML
- 衰减公式：`weight = max(0.1, 1 - days_since_epoch / max_days)`
- 半年以上压到最低权重 0.1
- 最新视频观点主导最终输出

### Nugget 格式 (Stage 1 输出)

```markdown
## 知识
- **核心观点**: [1-3条核心观点]
- **分析方法**: [使用的分析框架/方法]
- **关键证据**: [引用的数据或证据]
- **立场**: [bullish/bearish/neutral], confidence: [0-1]

## 风格
- **语气**: [描述语气特征]
- **标志句**: [3-5个标志性表达]
- **结构特征**: [句子长度、段落结构等]
```

### Agent 配置格式 (Stage 2 输出)

```yaml
id: xiaobai-finance
name: 小白财经
description: 专注于A股短线交易的财经博主

personality:
  stance: neutral
  style: |
    表达直接但不激进...
  background: 15年A股实战经验...
  principles:
    - 不看消息面，只看资金面和技术面
    - 止损永远第一
  signature_phrases:
    - "这个位置不太舒服"
    - "大家可以回头验证"

capabilities:
  - technical-analysis
  - short-term-trading

knowledge:
  domains:
    - A股短线打板
  frameworks:
    - name: 龙头战法
      description: ...
  common_patterns:
    - pattern: 放量突破前高
      interpretation: 资金认可，可以追
```

## CLI 接口

```bash
npx douyin-distill <--handle @ID | --url URL>

  --max-videos 50         限制处理数
  --update                增量模式
  --skip-download         跳过下载
  --output ./my-agents    输出目录
  --concurrency 5         并发数
  --asr-cloud openai      切换云端 ASR
  --asr-model small       本地模型大小
  --model deepseek        LLM 模型
  --provider openai       LLM provider
  --dry-run               只列不跑
  --verbose               详细日志
  --resume                从断点继续
```

## 环境与依赖

### 运行时二进制（用户自行安装）

- `ffmpeg` — 系统包管理器安装
- `whisper` (whisper.cpp) — 系统安装或首次运行自动下载

### npm 依赖（仅 3 个）

- `commander` — CLI 参数解析
- `chalk` — 终端颜色
- `ora` — spinner 进度

### 启动时环境检查

```
✗ ffmpeg not found → 安装指引
✗ whisper not found → 安装指引
✗ Douyin API not reachable → 启动指引
```

## 错误处理

| 步骤 | 失败策略 |
|------|---------|
| fetch-list | 重试 3 次 → 中断 |
| download | 单视频失败标记 false，继续 |
| extract-audio | 单视频失败标记 error，继续 |
| transcribe | 单视频失败标记 error，继续 |
| distill Stage 1 | 部分失败跳过，全失败中断 |
| distill Stage 2 | 重试 2 次 → 中断 |

## 测试策略

### 单元测试

每步独立测试，外部依赖 mock（API、ffmpeg、whisper、LLM）。

### Fixture 驱动

使用固定输入文件验证输出格式正确性，不依赖真实外部服务。

### E2E 测试

用一个本地 mp4 文件跑完整管线，验证状态文件写入和最终 YAML 格式。

### 不追求覆盖率

关键路径（管线编排、状态恢复、输出格式）必须覆盖，边界情况按需补充。

## 与 AgentTrade 集成

本工具独立于 AgentTrade，但输出格式与 AgentTrade 的 `BaseAgent` 接口对齐。用户蒸馏完成后：

1. 拷贝 `output/{handle}.yaml` 到 AgentTrade 项目
2. 在 `packages/agents/src/` 下创建 Agent 实例，加载 YAML 配置
3. 注册到 `AgentRegistry` 即可参与工作流

未来可考虑 AgentTrade 侧提供 `loadDistilledAgent(yamlPath)` 便捷方法，但不在本工具范围内。

## 非目标（YAGNI）

- ✗ Web UI 或 GUI
- ✗ SDK / 编程 API
- ✗ 内置上传到 SaaS
- ✗ 实时流处理
- ✗ 多语言 ASR 混合
- ✗ 视频理解（画面分析）
- ✗ 增量微调 LLM / LoRA
