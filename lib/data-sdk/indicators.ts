// lib/data-sdk/indicators.ts
// Local technical indicator calculation. Zero dependencies.

export interface MACDItem {
  index: number;
  dif: number | null;
  dea: number | null;
  histogram: number | null;
}

export interface BollingerItem {
  middle: number | null;
  upper: number | null;
  lower: number | null;
}

// ─── Helpers ───

function ema(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(round4(prev));
  }
  return result;
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i < period - 1) {
      result.push(null);
    } else {
      if (i >= period) sum -= values[i - period];
      result.push(round2(sum / period));
    }
  }
  return result;
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
function round4(v: number): number { return Math.round(v * 10000) / 10000; }

// ─── MACD ───

export function calcMACD(
  closes: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): MACDItem[] {
  if (closes.length < slow + signal) return [];

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);

  const dif: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      dif.push(round4(emaFast[i]! - emaSlow[i]!));
    } else {
      dif.push(null);
    }
  }

  const difNums = dif.filter((v): v is number => v != null);
  const deaRaw = ema(difNums, signal);
  const deaNulls = dif.length - difNums.length;
  const dea: (number | null)[] = new Array(deaNulls).fill(null);
  for (const v of deaRaw) dea.push(v);

  const result: MACDItem[] = [];
  for (let i = 0; i < closes.length; i++) {
    const d = dif[i];
    const dVal = dea[i] ?? null;
    const hist = d != null && dVal != null ? round4(2 * (d - dVal)) : null;
    result.push({ index: i, dif: d, dea: dVal, histogram: hist });
  }
  return result;
}

// ─── RSI ───

export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null);

  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);

  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));

  const result: (number | null)[] = new Array(period).fill(null);

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) result.push(100);
  else result.push(round2(100 - 100 / (1 + avgGain / avgLoss)));

  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0) result.push(100);
    else result.push(round2(100 - 100 / (1 + avgGain / avgLoss)));
  }
  return result;
}

// ─── MA ───

export function calcMA(
  closes: number[],
  periods: number[] = [5, 10, 20, 60],
): Record<string, (number | null)[]> {
  const result: Record<string, (number | null)[]> = {};
  for (const p of periods) result[String(p)] = sma(closes, p);
  return result;
}

// ─── Bollinger Bands ───

export function calcBollinger(
  closes: number[],
  period: number = 20,
  stdDev: number = 2,
): BollingerItem[] {
  const ma = sma(closes, period);
  const stds: (number | null)[] = new Array(period - 1).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    stds.push(Math.sqrt(variance));
  }

  const result: BollingerItem[] = [];
  for (let i = 0; i < closes.length; i++) {
    const middle = ma[i];
    const std = stds[i] ?? null;
    result.push({
      middle: middle != null ? round2(middle) : null,
      upper: middle != null && std != null ? round2(middle + stdDev * std) : null,
      lower: middle != null && std != null ? round2(middle - stdDev * std) : null,
    });
  }
  return result;
}
