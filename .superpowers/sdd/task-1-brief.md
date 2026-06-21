### Task 1: Install PrimeVue and configure in main.ts

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces: PrimeVue plugin registered globally, unstyled mode

- [ ] **Step 1: Add primevue dependency**

```bash
pnpm --filter @agenttrade/web add primevue
```

- [ ] **Step 2: Run pnpm install to update lockfile**

```bash
pnpm install
```

- [ ] **Step 3: Configure PrimeVue in main.ts**

Read the current file at `packages/web/src/main.ts`:
```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
```

Replace with:
```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());
app.use(PrimeVue, {
  unstyled: true,
});
app.mount("#app");
```

- [ ] **Step 4: Verify PrimeVue resolves — quick typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -20
```
Expected: no new errors from PrimeVue imports (unused import warning for PrimeVue is OK at this stage).

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml packages/web/src/main.ts
git commit -m "chore: add primevue dependency and configure unstyled mode"
```

---

