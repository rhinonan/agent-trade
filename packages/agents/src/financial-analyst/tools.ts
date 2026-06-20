import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DataClient } from "@agenttrade/data-client";

const client = new DataClient({ baseUrl: process.env.DATA_SERVICE_URL ?? "http://localhost:9500" });

export const getFinancialSummaryTool = tool(
  async ({ symbol }) => client.financial.summary(symbol),
  { name: "get_financial_summary", description: "获取财报关键指标：营收增速、利润增速、毛利率、ROE等",
    schema: z.object({ symbol: z.string() }) }
);

export const getValuationTool = tool(
  async ({ symbol }) => client.financial.valuation(symbol),
  { name: "get_valuation", description: "获取估值指标：PE、PB、PS、市值等",
    schema: z.object({ symbol: z.string() }) }
);
