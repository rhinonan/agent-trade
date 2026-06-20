### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore` (already exists, verify)
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/data-client/package.json`
- Create: `packages/data-client/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`

**Interfaces:**
- Consumes: nothing
- Produces: pnpm workspaces monorepo with 4 packages, all building cleanly

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "agenttrade",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "analyze": "pnpm --filter @agenttrade/cli exec agenttrade"
  }
}
```

- [ ] **Step 2: Write pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Write tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 4: Write packages/core/package.json**

```json
{
  "name": "@agenttrade/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 5: Write packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 6: Write packages/agents/package.json**

```json
{
  "name": "@agenttrade/agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@agenttrade/core": "workspace:*",
    "@agenttrade/data-client": "workspace:*",
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 7: Write packages/agents/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 8: Write packages/data-client/package.json**

```json
{
  "name": "@agenttrade/data-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 9: Write packages/data-client/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 10: Write packages/cli/package.json**

```json
{
  "name": "@agenttrade/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "bin": { "agenttrade": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@agenttrade/core": "workspace:*",
    "@agenttrade/agents": "workspace:*",
    "@agenttrade/data-client": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 11: Write packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 12: Create placeholder src/index.ts in each package**

`packages/core/src/index.ts`:
```typescript
export const VERSION = "0.1.0";
```

`packages/agents/src/index.ts`:
```typescript
export const VERSION = "0.1.0";
```

`packages/data-client/src/index.ts`:
```typescript
export const VERSION = "0.1.0";
```

`packages/cli/src/index.ts`:
```typescript
console.log("AgentTrade CLI v0.1.0");
```

- [ ] **Step 13: Install dependencies and verify build**

```bash
cd D:\c2 && pnpm install && pnpm build
```
Expected: all 4 packages compile without errors.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "scaffold: pnpm monorepo with core/agents/data-client/cli packages"
```

---

