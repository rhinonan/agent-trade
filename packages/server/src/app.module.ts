import { Module } from "@nestjs/common";
import { AnalyzeModule } from "./analyze/analyze.module.js";

@Module({
  imports: [AnalyzeModule],
})
export class AppModule {}
