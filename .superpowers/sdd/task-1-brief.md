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


