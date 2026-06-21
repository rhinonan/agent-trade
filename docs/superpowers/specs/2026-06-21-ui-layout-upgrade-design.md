# UI 排版布局升级 — 设计文档

> 日期: 2026-06-21
> 状态: 已确认
> 前提: 颜色/风格（深海军蓝+青蓝玻璃+辉光）已完成，本次仅改排版

## 概述

在已完成的色彩系统升级基础上，对 AgentTrade Web 前端进行排版重构。将当前平铺堆叠的布局改造为分组卡片式侧边栏 + 时间线主内容区的专业排版结构，采用 8px 网格间距系统。

## 设计范围

- 侧边栏: InputPanel 拆分为三组玻璃卡片
- 主内容区: FlowView 流程条轻量化 + LiveLog 增高 + ReportView 统一玻璃面板
- 全局间距: 统一 8px 倍数网格系统
- 分隔线: 青蓝渐变淡出线替代纯色边框

## 全局间距系统 (8px Grid)

| Token | 值 | 用途 |
|-------|-----|------|
| `space-xs` | 8px | 组件内紧凑元素间距 |
| `space-sm` | 12px | 表单元素间、label-input 间距 |
| `space-md` | 16px | 卡片内 padding、卡片组间距 |
| `space-lg` | 24px | 页面级 padding、流程→日志间距 |
| `space-xl` | 32px | 日志→报告大区块间距 |
| `space-2xl` | 48px | 预留，特殊转折处 |

## 侧边栏改造

### 布局结构
- 宽度: `w-84` (336px)
- 整体分为三组玻璃卡片，组间距 16px
- 顶部标题 "分析参数" 保留在 sidebar header

### 组1: 分析目标
- 玻璃卡片包裹，内 padding 16px
- 卡片顶部标题 "分析目标"，`text-sm #8899b4 letter-spacing:0.03em`，下方 12px 分隔线
- 股票代码 input + 板块名称 input，间距 12px
- label 缩小为 11px `text-secondary`，位于 input 上方 6px

### 组2: 模型配置
- 同上玻璃卡片结构
- 标题 "模型配置"
- 工作流 select + 模型选择（provider select + model input），间距 12px

### 组3: 操作
- 同上玻璃卡片结构
- 标题 "操作"
- 渐变按钮保持现有风格
- 进度改为 4px 细线进度条：左侧 "步骤 3/5"，右侧百分比
- 进度条位于按钮下方 12px
- 错误提示在进度条下方
- "新分析" 按钮保持玻璃风格，在最下方

### 分隔线
- 青蓝渐变淡出: `linear-gradient(90deg, var(--cyan) 0%, transparent 60%)`
- 高度: 1px
- 用于卡片内标题下方

## 主内容区改造

### 区块1: 分析流程（轻量化）
- 去掉 `glass-panel-glow` 外层包裹 → 透明背景
- 步骤胶囊缩小: `py-1.5 px-3`，字体 12px
- 步骤间连接线缩短: `w-3`
- 整体高度控制在 ~48px
- 标题 "分析流程" 左对齐，与步骤同行
- 下方 24px 分隔线（渐变淡出）

### 区块2: 实时输出（增高 + 玻璃）
- 日志区高度: `h-60` → `h-80` (320px)
- 外层 `glass-panel` 包裹
- 终端风格、扫描线、青色运行点保留
- 下方 32px 分隔线（渐变淡出）

### 区块3: 分析报告（统一面板）
- 外层一个大 `glass-panel` 包裹整个报告
- 标题栏: `bg-[#0a1220]` 深色条，左侧标题 + 右侧标的名称
- 内容区 padding: 24px
- 多空分布 + 各方观点: 保持 `grid-cols-[280px_1fr]`
- 各方观点卡片: 从全宽列表改为最多 2 列网格
- 综合研判: 全宽，左侧竖线（3px 青蓝渐变）替代顶部辉光条
- 报告仅在 `status === 'complete'` 时显示，带 `fade-in` 动画

## 组件变更清单

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `App.vue` | 修改 | spacing 变量、分隔线样式 |
| `InputPanel.vue` | 重构 | 拆分为三组卡片，细线进度条 |
| `FlowView.vue` | 修改 | 去流程步骤玻璃包裹，调整间距 |
| `LiveLog.vue` | 修改 | 增高到 h-80 |
| `StepProgress.vue` | 修改 | 缩小胶囊，轻量化 |
| `ReportView.vue` | 重构 | 统一玻璃面板包裹，深色标题栏 |
| `FindingList.vue` | 修改 | 2列网格布局 |
| `ConclusionCard.vue` | 修改 | 左侧竖线替代顶部辉光条 |
| `SentimentChart.vue` | 不变 | 保持现有渐变条设计 |

## 不变更
- 所有组件逻辑、props/emits、store、WebSocket
- 色彩系统 CSS 变量（仅新增 spacing 变量）
- 动画 keyframes
- 玻璃面板基础样式 `.glass-panel` `.glass-panel-glow`
