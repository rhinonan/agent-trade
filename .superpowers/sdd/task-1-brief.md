### Task 1: App.vue — spacing 变量 + 分隔线 + 侧边栏宽度

**Files:**
- Modify: `packages/web/src/App.vue`

**Consumes:** 现有 CSS 变量和样式
**Produces:** `--space-xs` 到 `--space-xl` 变量；`.divider-cyan` 分隔线类；sidebar `w-84`

- [ ] **Step 1: 新增 spacing 变量和分隔线样式**

在 `App.vue` 的 `<style>` 中 `:root {}` 块末尾添加 spacing 变量，在 scrollbar 块后添加分隔线样式。

`:root` 追加:
```css
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
```

scrollbar 块后追加:
```css
/* divider */
.divider-cyan {
  height: 1px;
  border: none;
  background: linear-gradient(90deg, var(--cyan), transparent 60%);
  margin: 0;
}

/* card group title */
.card-group-title {
  color: var(--text-secondary);
  font-size: 14px;
  letter-spacing: 0.03em;
  font-weight: 600;
  margin-bottom: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-default);
}
```

- [ ] **Step 2: 侧边栏宽度改为 w-84**

`<template>` 中 `<aside class="w-80 min-w-80 ...">` 改为:
```html
<aside class="w-84 min-w-84 border-r p-6 overflow-y-auto" style="background: var(--bg-surface-glass); border-color: var(--border-default);">
```

- [ ] **Step 3: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.vue
git commit -m "feat(web): add spacing CSS variables, divider style, and sidebar width increase"
```

---

