### Task 1: Scaffold Next.js project

**Files:**
- Create: `nextjs-app/package.json`
- Create: `nextjs-app/tsconfig.json`
- Create: `nextjs-app/next.config.ts`
- Create: `nextjs-app/tailwind.config.ts`
- Create: `nextjs-app/postcss.config.mjs`
- Create: `nextjs-app/vitest.config.ts`
- Modify: `agenttrade/package.json` (root — add workspace reference)

**Interfaces:**
- Consumes: nothing (fresh scaffold)
- Produces: Next.js project at `nextjs-app/` compiled via `pnpm dev`, Tailwind CSS 4 working, Vitest ready

- [ ] **Step 1: Create nextjs-app/package.json**

```json
{
  "name": "agenttrade",
  "version": "0.2.0",
  "private": true,
  "type": "module",
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
    "@langchain/openai": "^0.3.17",
    "better-sqlite3": "^11.0.0",
    "class-validator": "^0.14.1",
    "dotenv": "^17.4.2",
    "langchain": "^0.3.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
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

- [ ] **Step 2: Create nextjs-app/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": true,
    "paths": { "@/*": ["./*"] },
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create nextjs-app/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Create nextjs-app/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 5: Create tailwind and postcss configs**

```bash
mkdir -p nextjs-app/app
cat > nextjs-app/postcss.config.mjs << 'EOF'
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
EOF
```

- [ ] **Step 6: Create nextjs-app/app/globals.css with Tailwind**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create minimal app/layout.tsx and app/page.tsx to verify scaffold works**

Create `nextjs-app/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AgentTrade", description: "多Agent对抗行情分析" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
```

Create `nextjs-app/app/page.tsx`:
```typescript
export default function HomePage() {
  return <main className="flex min-h-screen items-center justify-center"><h1 className="text-4xl font-bold">AgentTrade</h1></main>;
}
```

- [ ] **Step 8: Install and verify**

```bash
cd nextjs-app && pnpm install && pnpm next dev --port 3000 &
# Open http://localhost:3000 — should show "AgentTrade"
```

- [ ] **Step 9: Commit**

```bash
cd nextjs-app
git add package.json tsconfig.json next.config.ts vitest.config.ts postcss.config.mjs app/
git commit -m "feat: scaffold Next.js project with Tailwind CSS 4"
```

---

