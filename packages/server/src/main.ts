import "dotenv/config";
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
