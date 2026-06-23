# 首页新增 + 科技光晕 + 响应式左右布局 设计文档

**日期**: 2026-06-23
**状态**: 已确认

---

## 一、概述

本次改造包含三部分：
1. **新增项目介绍首页** — 在现有搜索入口之上增加一层门户页面
2. **科技光晕氛围** — 极简科技风：渐变光晕背景 + 卡片悬浮发光 + 标题文字辉光
3. **分析页响应式布局** — 宽屏（≥1024px）下从上下布局切换为左右布局，右侧展示行情数据

---

## 二、路由架构

| 路由 | 内容 | 变更 |
|------|------|------|
| `/` | **新首页** — 项目介绍门户 | **新增** |
| `/analyze` | 股票搜索 + 工作流选择 + 最近分析 | 从 `/` 迁移 |
| `/session/[id]` | 分析页 — 聊天 + 右侧数据面板 | 改造 |
| `/history` | 历史记录 | 不变 |

---

## 三、首页设计 (`/`)

首页目标是让新访客 10 秒内理解项目是什么。

### 3.1 Hero 区

- 居中布局
- 标题 "AgentTrade"，`text-6xl font-bold`，emerald 色 + 文字辉光
- 副标题 "多 Agent 对抗行情分析"
- 描述文案："基于 LLM 多智能体协作的 A 股深度分析平台"
- CTA 按钮："开始分析" → `/analyze`，emerald-600 大按钮

### 3.2 特性卡片区（3 列）

三个卡片，平铺展示核心卖点：

| 卡片 | 图标 | 标题 | 描述 |
|------|------|------|------|
| 多 Agent 对抗 | 🐂🐻 | 多 Agent 对抗 | Bull / Bear / Advisor 三方辩论，减少单模型偏见 |
| 多工作流 | ⚡ | 多工作流模式 | 快速扫描 / 牛熊对抗 / 四层深度分析，按需选择 |
| 实时可见 | 📊 | 实时流式可见 | Agent 思考过程通过 SSE 实时推送，不是黑盒输出 |

卡片使用 Card 组件，默认半透明背景，hover 时 border 发光。

### 3.3 底部技术标签

轻量标签行：`LangChain` `SSE` `Next.js` `SQLite` `Multi-Agent`

无 footer 导航（页面少，不需要）。

---

## 四、光晕系统

纯 CSS 实现，不引入额外依赖。所有效果收敛在 `globals.css` 中，通过 CSS 变量和 utility 类使用。

### 4.1 Body 背景光晕

在 `body::before` 伪元素上放置一个大型 radial-gradient：

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% -20%, rgba(16, 185, 129, 0.06), transparent),
    radial-gradient(ellipse 60% 50% at 80% 60%, rgba(20, 184, 166, 0.04), transparent);
}
```

- 顶部居中 emerald 光斑 + 右下 teal 辅光斑
- 极低透明度（0.04-0.06），不影响可读性
- `pointer-events: none` 确保不阻挡交互
- 缓慢呼吸动画：10s ease-in-out 循环，透明度 ±30% 波动

### 4.2 卡片悬浮发光

定义 `.glow-hover` utility：

```css
.glow-hover {
  transition: border-color 0.3s, box-shadow 0.3s;
}
.glow-hover:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 0 20px -5px rgba(16, 185, 129, 0.1);
}
```

用于首页特性卡片、最近分析卡片等。

### 4.3 标题文字辉光

```css
.text-glow {
  text-shadow: 0 0 40px rgba(16, 185, 129, 0.3), 0 0 80px rgba(16, 185, 129, 0.1);
}
```

静态效果，不加动画。仅用于 Hero 标题。

### 4.4 实现要点

- 所有光晕 CSS 写在 `globals.css` 末尾，不污染各组件样式
- 不使用 tailwind 插件或配置修改，走纯 CSS 补充
- CSS 变量暴露可选参数（光晕颜色、大小），但不强制

---

## 五、分析页左右布局 (`/session/[id]`)

### 5.1 响应式断点

- `< 1024px`：保持现有上下布局（`flex-col`），ChatPanel 全宽全高
- `≥ 1024px`：切换左右布局（`flex-row`），`h-screen`

### 5.2 分栏

| | 左侧 | 右侧 |
|------|------|------|
| 宽度占比 | ~55% (flex-1, min-w-0) | ~45% (w-[440px], flex-shrink-0) |
| 内容 | ChatPanel（完整保留现有组件） | DataPanel（新建） |
| 背景 | 透明 | bg-zinc-950/50 + border-l |
| 滚动 | 内部滚动 | 独立 overflow-y-auto |

### 5.3 右侧 DataPanel 组件结构

```
DataPanel
├── QuoteCard          — 实时行情概览
├── IndicatorList      — 技术指标列表
└── AgentSummary       — Agent 结论摘要
```

**QuoteCard：**
- 股票代码 + 名称
- 现价（2xl 大字）+ 涨跌幅（红涨绿跌）+ 涨跌额
- 今日开盘 / 最高 / 最低 / 成交量（小字 grid）
- 数据来源：`/api/quote?code=xxx` fetch，5s 轮询

**IndicatorList：**
- MA5 / MA10 / MA20 / MA60 数值 + 方向（多头/空头排列）
- MACD（DIF/DEA/柱）+ 信号
- RSI 数值 + 区间解读（超买/中性/超卖）
- 可折叠，默认展开
- 数据来源：后端计算后通过 SSE 下发或单独 API

**AgentSummary：**
- 各 Agent 的最新结论（1-2 行摘要）
- 最终结论高亮（emerald 色底线）
- 随 SSE 流式更新
- 使用现有 `AgentBubble` 或简化的紧凑版本

### 5.4 布局实现

```tsx
// app/session/[id]/page.tsx (新)
<main className="h-screen flex flex-col lg:flex-row bg-zinc-950">
  <div className="flex-1 min-w-0 flex flex-col">
    <ChatPanel sessionId={id} agents={agents} />
  </div>
  <aside className="hidden lg:flex lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
    <DataPanel code={code} messages={messages} />
  </aside>
</main>
```

`ChatPanel` 组件本身不变 — 它在左侧 `div` 内仍然全高。从 ChatPanel 视角看，它仍是 h-full flex-col，不知道右侧面板的存在。

### 5.5 DataPanel 数据获取

- 股票代码从 session 信息获取（需要在 session 数据中包含 `targetCode`）
- 行情数据：前端 `useEffect` + `fetch` + `setInterval` 轮询 API
- 指标数据：随 SSE 流下发，存在 `messages` state 的 metadata 中
- 降级处理：API 不可用时显示 "行情数据暂不可用"，不阻断聊天功能

---

## 六、组件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/page.tsx` | **重写** | 新首页（Hero + 特性卡片 + 技术标签） |
| `app/analyze/page.tsx` | **新增** | 迁移原首页内容到此处 |
| `app/session/[id]/page.tsx` | **改造** | 添加左右布局 + DataPanel |
| `app/globals.css` | **修改** | 添加光晕系统 CSS |
| `components/landing/` | **移动** | 从 `page.tsx` 引用改为被 `analyze/page.tsx` 引用 |
| `components/analysis/DataPanel.tsx` | **新增** | 右侧数据面板容器 |
| `components/analysis/QuoteCard.tsx` | **新增** | 行情概览卡片 |
| `components/analysis/IndicatorList.tsx` | **新增** | 技术指标列表 |
| `components/analysis/AgentSummary.tsx` | **新增** | Agent 结论摘要（紧凑版） |

无删除，无破坏性变更。

---

## 七、非功能需求

### 7.1 性能
- 光晕纯 CSS，无 JS 计算，不影响性能
- 行情轮询间隔 5s，避免频繁请求
- DataPanel 组件在 mobile 下不渲染（`hidden lg:flex`），节省资源

### 7.2 可访问性
- 光晕层 `pointer-events: none`，不阻挡交互
- 颜色对比度保持现有标准
- 支持 `prefers-reduced-motion` 时关闭呼吸动画

### 7.3 错误处理
- 行情 API 失败 → 显示降级提示，聊天区正常运作
- SSE 断开 → 已有重连机制，不变
- DataPanel 不阻塞 ChatPanel

---

## 八、测试策略

- 新首页：渲染测试（标题、卡片、CTA 按钮存在）
- 路由迁移：`/analyze` 可访问，搜索功能正常
- 响应式布局：用不同 viewport 宽度验证 lg: 断点切换
- DataPanel：mock 行情数据测试 QuoteCard 和 IndicatorList 渲染
- 光晕：视觉验收（不做自动化测试）

---

## 九、风险和取舍

| 决策 | 理由 |
|------|------|
| 光晕放在 body 伪元素而非组件内 | 全局生效，零组件改动 |
| 右侧面板固定 440px 而非百分比 | 数据面板内容宽度可控，不会太宽或太窄 |
| 右侧面板 mobile 下完全隐藏 | 手机屏幕优先确保聊天体验不受影响 |
| 不引入新依赖 | 光晕纯 CSS，UI 组件复用现有 Card 等 |
| ChatPanel 不做接口改动 | 保持向后兼容，降低风险 |
