import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DataClient } from "@agenttrade/data-client";

const client = new DataClient({ baseUrl: process.env.DATA_SERVICE_URL ?? "http://localhost:9500" });

export const getKlineTool = tool(
  async ({ symbol, period, count }) => {
    return client.kline.get({ symbol, period: period as any, count });
  },
  {
    name: "get_kline",
    description: "获取A股K线数据。返回开盘价、最高价、最低价、收盘价、成交量。",
    schema: z.object({
      symbol: z.string().describe("股票代码，如 600519"),
      period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      count: z.number().default(120).describe("K线数量"),
    }),
  }
);

export const getIndicatorsTool = tool(
  async ({ symbol, names }) => {
    return client.kline.indicators({ symbol, names });
  },
  {
    name: "get_indicators",
    description: "获取技术指标：MACD、RSI、MA（多周期均线）、BOLL（布林带）",
    schema: z.object({
      symbol: z.string(),
      names: z.array(z.enum(["MACD", "RSI", "MA", "BOLL"])).default(["MACD", "RSI"]),
    }),
  }
);
