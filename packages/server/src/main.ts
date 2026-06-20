import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load .env from repo root regardless of cwd
dotenv.config({ path: resolve(__dirname, "../../..", ".env") });

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: "*" });
  const port = process.env.SERVER_PORT ?? 3000;
  await app.listen(port);
  console.log(`AgentTrade Server running on http://localhost:${port}`);
}

bootstrap();
