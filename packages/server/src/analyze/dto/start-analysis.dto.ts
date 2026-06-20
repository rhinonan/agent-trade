import { IsOptional, IsString, IsIn } from "class-validator";
import { Type } from "class-transformer";

export class StartAnalysisDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  index?: string;

  @IsOptional()
  @IsString()
  @IsIn(["bull-bear", "quick-scan"])
  workflow?: string = "bull-bear";

  @IsOptional()
  @IsString()
  @IsIn(["anthropic", "openai", "deepseek"])
  provider?: string = "deepseek";

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  dataServiceUrl?: string = "http://localhost:9500";
}
