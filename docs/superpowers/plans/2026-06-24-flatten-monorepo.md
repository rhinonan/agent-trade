# Flatten Monorepo — Move nextjs-app to Root

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the pnpm monorepo wrapper and move all Next.js application code from `nextjs-app/` to the repository root, making it a standard single-package Next.js project.

**Architecture:** The project was structured as a monorepo with a single workspace (`nextjs-app`). Flattening removes the unnecessary nesting — `nextjs-app/` contents move up one level, `pnpm-workspace.yaml` is deleted, and the root `package.json` is replaced with the app's package.json. The `roles/` directory stays at root (already correctly placed). One code change is required: `resolveRolesDir()` in the LangGraph runner must drop the `..` parent traversal since `cwd` will now be the repo root.

**Tech Stack:** Next.js 15, TypeScript 5, pnpm 9, Socket.IO

## Global Constraints

- All `@/*` path alias imports must continue to resolve correctly (tsconfig `baseUrl: "."` + `paths: {"@/*": ["./*"]}` already handles this)
- `roles/` directory stays at repo root — no changes to YAML files or role loading logic (except `resolveRolesDir()`)
- SQLite database files in `data/` must be preserved (they are gitignored but should not be lost)
- Existing `.env` at root must be preserved (it contains real API keys)
- All tests must pass after migration
- No breaking changes to the Next.js build or dev server

---

### Task 1: Move core application files from nextjs-app/ to root

**Files:**
- Move: `nextjs-app/app/` → `app/`
- Move: `nextjs-app/components/` → `components/`
- Move: `nextjs-app/hooks/` → `hooks/`
- Move: `nextjs-app/lib/` → `lib/`
- Move: `nextjs-app/scripts/` → `scripts/`
- Move: `nextjs-app/data/` → `data/`
- Move: `nextjs-app/__tests__/` → `__tests__/`
- Move: `nextjs-app/server.mjs` → `server.mjs`
- Move: `nextjs-app/middleware.ts` → `middleware.ts`
- Move: `nextjs-app/next.config.ts` → `next.config.ts`
- Move: `nextjs-app/tsconfig.json` → `tsconfig.json`
- Move: `nextjs-app/vitest.config.ts` → `vitest.config.ts`
- Move: `nextjs-app/vitest.setup.ts` → `vitest.setup.ts`
- Move: `nextjs-app/postcss.config.mjs` → `postcss.config.mjs`
- Move: `nextjs-app/next-env.d.ts` → `next-env.d.ts`
- Move: `nextjs-app/package.json` → `package.json.nextjs` (temporary, to avoid overwriting root package.json yet)

**Interfaces:**
- Consumes: Current `nextjs-app/` directory structure
- Produces: All application files at repo root; `package.json.nextjs` as temp file for Task 2

- [ ] **Step 1: Move app directory and all source directories**

```bash
# Move application source directories
mv nextjs-app/app .
mv nextjs-app/components .
mv nextjs-app/hooks .
mv nextjs-app/lib .
mv nextjs-app/scripts .
mv nextjs-app/data .
mv nextjs-app/__tests__ .
```

- [ ] **Step 2: Move configuration files to root**

```bash
# Move config files
mv nextjs-app/server.mjs .
mv nextjs-app/middleware.ts .
mv nextjs-app/next.config.ts .
mv nextjs-app/tsconfig.json .
mv nextjs-app/vitest.config.ts .
mv nextjs-app/vitest.setup.ts .
mv nextjs-app/postcss.config.mjs .
mv nextjs-app/next-env.d.ts .

# Move package.json as temporary file (don't overwrite root yet)
mv nextjs-app/package.json ./package.json.nextjs
```

- [ ] **Step 3: Verify files are in place**

```bash
ls -la app/ components/ hooks/ lib/ scripts/ data/ __tests__/
ls -la server.mjs middleware.ts next.config.ts tsconfig.json vitest.config.ts
ls -la postcss.config.mjs package.json.nextjs
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move nextjs-app contents to repo root"
```


### Task 2: Replace root package.json and clean up monorepo files

**Files:**
- Replace: `package.json` (root) — merge scripts from `package.json.nextjs`, drop monorepo wrapper
- Delete: `pnpm-workspace.yaml`
- Delete: `tsconfig.base.json`
- Delete: `package.json.nextjs` (temporary)
- Delete: `workflows/` (empty root directory)
- Delete: `nextjs-app/` (now-empty directory)

**Interfaces:**
- Consumes: `package.json.nextjs` from Task 1
- Produces: Clean root `package.json` with direct scripts (no `cd nextjs-app &&`)

- [ ] **Step 1: Replace root package.json with the app's package.json**

Read the app's package.json from `package.json.nextjs`, then write the final root `package.json`:

```json
{
  "name": "agenttrade",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "pnpm": {
    "overrides": {
      "esbuild": "^0.25.0"
    }
  },
  "scripts": {
    "dev": "node server.mjs",
    "build": "next build && tsc",
    "start": "NODE_ENV=production node server.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@langchain/anthropic": "^0.3.34",
    "@langchain/core": "^0.3.0",
    "@langchain/langgraph": "^0.4.9",
    "@langchain/openai": "^0.3.17",
    "better-sqlite3": "^11.0.0",
    "class-validator": "^0.14.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "dotenv": "^17.4.2",
    "js-yaml": "^5.1.0",
    "langchain": "^0.3.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "tailwind-merge": "^3.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Remove monorepo files and old directories**

```bash
rm pnpm-workspace.yaml
rm tsconfig.base.json
rm package.json.nextjs
rmdir workflows   # empty directory
rmdir nextjs-app  # should now be empty (or contain only .next/ and node_modules/)
# If nextjs-app still has contents:
rm -rf nextjs-app/.next nextjs-app/node_modules
rmdir nextjs-app   # if still not empty, use: rm -rf nextjs-app
```

If `nextjs-app/` still has files (`.env`, remnants):
```bash
rm -rf nextjs-app
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove monorepo wrapper, replace root package.json"
```


### Task 3: Fix resolveRolesDir() to work from repo root

**Files:**
- Modify: `lib/langgraph/runner.ts:28-32`

**Interfaces:**
- Consumes: `process.cwd()` which is now the repo root (not `nextjs-app/`)
- Produces: Correct `roles/` path — `path.resolve(process.cwd(), "roles")` instead of `path.resolve(process.cwd(), "..", "roles")`

- [ ] **Step 1: Update resolveRolesDir()**

In `lib/langgraph/runner.ts`, change lines 27-32:

```typescript
/**
 * Resolve the roles directory relative to the repo root.
 * Roles live at <repo-root>/roles/.
 */
function resolveRolesDir(): string {
  return path.resolve(process.cwd(), "roles");
}
```

- [ ] **Step 2: Verify the fix is correct**

```bash
node -e "console.log(require('path').resolve(process.cwd(), 'roles'))"
```
Expected output: `D:\Code2\agent-trade\roles`

- [ ] **Step 3: Commit**

```bash
git add lib/langgraph/runner.ts
git commit -m "fix: update resolveRolesDir() for flattened repo structure"
```


### Task 4: Fix integration test repoRoot paths

**Files:**
- Modify: `__tests__/integration/chat-flow.test.ts:14-18`
- Modify: `__tests__/integration/analyze-flow.test.ts:11-15`

**Interfaces:**
- Consumes: `__dirname` which is now `.../agent-trade/__tests__/integration` (one level shallower)
- Produces: `repoRoot` resolves to `.../agent-trade` (repo root) instead of `.../agent-trade` (grandparent of grandparent)

- [ ] **Step 1: Fix chat-flow.test.ts repoRoot**

In `__tests__/integration/chat-flow.test.ts`, lines 14-18 currently:
```typescript
// Load .env from repo root (nextjs-app/../.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../../..");
dotenv.config({ path: resolve(repoRoot, ".env") });
```

After the move, `__tests__/integration/` is at repo root level, so `repoRoot` is `../..` (test file → `__tests__/integration/` → `__tests__/` → repo root). Change to:

```typescript
// Load .env from repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../..");
dotenv.config({ path: resolve(repoRoot, ".env") });
```

- [ ] **Step 2: Fix analyze-flow.test.ts repoRoot**

In `__tests__/integration/analyze-flow.test.ts`, lines 11-15 currently:
```typescript
// Load .env from repo root (nextjs-app/../.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../../..");
dotenv.config({ path: resolve(repoRoot, ".env") });
```

Change to:
```typescript
// Load .env from repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../..");
dotenv.config({ path: resolve(repoRoot, ".env") });
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration/chat-flow.test.ts __tests__/integration/analyze-flow.test.ts
git commit -m "fix: update integration test repoRoot paths after flattening"
```


### Task 5: Update documentation (AGENTS.md and README.md)

**Files:**
- Modify: `AGENTS.md` — update file paths and commands that reference `nextjs-app/`
- Modify: `README.md` — same

**Interfaces:**
- Consumes: Current docs with `nextjs-app/` references
- Produces: Docs with root-level paths

- [ ] **Step 1: Update AGENTS.md**

In `AGENTS.md`, replace all `nextjs-app/` references in the project structure section and commands:

**Line 30** — Remove `nextjs-app/` root from the tree diagram, make the tree start at root:

Change:
```
nextjs-app/
├── app/                          Next.js App Router
```
To:
```
├── app/                          Next.js App Router
```

**Line 122** — Update path alias description:
```
- **Path alias:** `@/*` maps to `./*` for imports (tsconfig baseUrl: ".")
```

**Lines 222-235** — Update test/lint commands to run from root:

```bash
# All tests
pnpm test

# Single file
pnpm vitest run lib/langgraph/__tests__/nodes.test.ts
pnpm vitest run lib/role-loader/__tests__/loader.test.ts

# Watch mode
pnpm vitest

# Integration tests (requires data service + API keys)
pnpm vitest run __tests__/integration/

# Type check
pnpm lint
```

- [ ] **Step 2: Update README.md**

Search `README.md` for all `nextjs-app` references and replace with root-level paths. Key changes:

Line with `cd nextjs-app` → `pnpm dev` / `pnpm test` (no `cd` needed)

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: update paths for flattened repo structure"
```


### Task 6: Reinstall dependencies and verify

**Files:**
- Modify: `pnpm-lock.yaml` (regenerated)
- Create: `node_modules/` (regenerated)

**Interfaces:**
- Consumes: New root `package.json`
- Produces: Fresh `node_modules/` and `pnpm-lock.yaml`

- [ ] **Step 1: Clean old dependencies**

```bash
rm -rf node_modules
rm -rf pnpm-lock.yaml
```

- [ ] **Step 2: Reinstall**

```bash
pnpm install
```

Expected: pnpm installs all dependencies from root `package.json`. No errors.

- [ ] **Step 3: Run unit tests**

```bash
pnpm test
```

Expected: All unit tests pass (tests in `lib/` and `hooks/` directories). Integration tests may be skipped.

- [ ] **Step 4: Run type check**

```bash
pnpm lint
```

Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 5: Quick dev server smoke test**

```bash
# Start dev server briefly to verify it boots
timeout 15 node server.mjs || true
```

Expected: Server starts without errors (no port conflict, Socket.IO initializes, Next.js compiles). Timeout expected — success is no crash before timeout.

- [ ] **Step 6: Commit**

```bash
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile for flattened structure"
```
