// lib/data-sdk/__tests__/smoke.ts
// Manual smoke test — run with: npx tsx lib/data-sdk/__tests__/smoke.ts
// Tests real APIs. Some may fail due to network/IP restrictions.

import { AStockClient } from "../client.js";

const client = new AStockClient({ timeout: 20_000 });

async function main() {
  console.log("=== A-Stock Data SDK Smoke Test ===\n");

  // 1. Tencent: Quote
  console.log("1. Tencent quote (600519 贵州茅台)...");
  const q = await client.market.quote(["600519"]);
  console.log(`   source=${q.source}, data=${q.data ? "OK" : "NULL"}, error=${q.error ?? "none"}`);
  if (q.data) {
    const m = q.data["600519"];
    console.log(`   ${m.name}: price=${m.price}, PE=${m.peTtm}, PB=${m.pb}, 市值=${m.marketCapYi}亿`);
  }

  // 2. Baidu: K-line
  console.log("\n2. Baidu K-line (600519 daily)...");
  const k = await client.market.kline("600519", { count: 5 });
  console.log(`   source=${k.source}, bars=${k.data?.length ?? 0}, error=${k.error ?? "none"}`);
  if (k.data) k.data.slice(-3).forEach((b: any) => console.log(`   ${b.date}: O=${b.open} C=${b.close} V=${b.volume}`));

  // 3. Tencent: Search
  console.log("\n3. Tencent search (平安)...");
  const s = await client.market.search("平安");
  console.log(`   source=${s.source}, results=${s.data?.length ?? 0}`);
  if (s.data) s.data.slice(0, 3).forEach((r: any) => console.log(`   ${r.symbol} ${r.name} ${r.type}`));

  // 4. Eastmoney: Stock info
  console.log("\n4. Eastmoney stock info (600519)...");
  await new Promise((r) => setTimeout(r, 1200)); // respect rate limiter
  const info = await client.fundamentals.stockInfo("600519");
  console.log(`   source=${info.source}, data=${info.data ? "OK" : "NULL"}, error=${info.error ?? "none"}`);
  if (info.data) console.log(`   ${info.data.name}: industry=${info.data.industry}, listed=${info.data.listedDate}`);

  // 5. Sina: Income statement
  console.log("\n5. Sina income statement (600519)...");
  const income = await client.fundamentals.incomeStatement("600519");
  console.log(`   source=${income.source}, data=${income.data ? "OK" : "NULL"}, error=${income.error ?? "none"}`);
  if (income.data) console.log(`   revenue=${income.data.revenue}, netProfit=${income.data.netProfit}, ROE=${income.data.roe}`);

  // 6. Eastmoney: Sector list
  console.log("\n6. Eastmoney sector list...");
  await new Promise((r) => setTimeout(r, 1200));
  const sectors = await client.signal.sectorRanking();
  console.log(`   source=${sectors.source}, count=${sectors.data?.length ?? 0}, error=${sectors.error ?? "none"}`);
  if (sectors.data) sectors.data.slice(0, 5).forEach((sec: any) => console.log(`   ${sec.name}: ${sec.changePct}%`));

  console.log("\n=== Smoke Test Complete ===");
}

main().catch(console.error);
