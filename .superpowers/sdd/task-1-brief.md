### Task 1: Project Scaffolding

**Files:**
- Create: `d:/douyin-distill/package.json`
- Create: `d:/douyin-distill/tsconfig.json`
- Create: `d:/douyin-distill/.gitignore`
- Create: `d:/douyin-distill/.env.example`
- Create: `d:/douyin-distill/README.md` (skeleton)

**Interfaces:**
- Produces: `package.json` with `"name": "douyin-distill"`, `"type": "module"`, bin entry `"douyin-distill": "./dist/index.js"`, scripts `build`, `dev`, `test`, deps `commander`, `chalk`, `ora`, devDeps `typescript`, `vitest`, `@types/node`

- [ ] **Step 1: Initialize repo and package.json**

```bash
mkdir d:/douyin-distill
cd d:/douyin-distill
git init
pnpm init
```

Then write `package.json`:

```json
{
  "name": "douyin-distill",
  "version": "0.1.0",
  "description": "Distill Douyin bloggers into AI agent prompts",
  "type": "module",
  "bin": {
    "douyin-distill": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.12.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
.env
*.tsbuildinfo
```

- [ ] **Step 4: Write .env.example**

```
DOUYIN_API_URL=http://localhost:9501
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

- [ ] **Step 5: Install and verify build**

```bash
cd d:/douyin-distill
pnpm install
mkdir -p src
echo 'console.log("ok");' > src/index.ts
pnpm build
node dist/index.js
```

Expected: prints `ok`

- [ ] **Step 6: Commit**

```bash
cd d:/douyin-distill
git add -A
git commit -m "chore: project scaffolding"
```

---

