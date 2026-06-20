"""Technical indicator calculation using pandas/numpy."""

import pandas as pd
import numpy as np
from typing import Optional


def calc_macd(closes: list[float], fast: int = 12, slow: int = 26,
              signal: int = 9) -> list[dict]:
    """Calculate MACD indicators. Returns list of {date_index, dif, dea, histogram}."""
    if len(closes) < slow + signal:
        return []
    closes_series = pd.Series(closes)
    ema_fast = closes_series.ewm(span=fast, adjust=False).mean()
    ema_slow = closes_series.ewm(span=slow, adjust=False).mean()
    dif = ema_fast - ema_slow
    dea = dif.ewm(span=signal, adjust=False).mean()
    histogram = 2 * (dif - dea)
    result = []
    for i in range(len(closes)):
        result.append({
            "index": i,
            "dif": round(float(dif.iloc[i]), 4) if not pd.isna(dif.iloc[i]) else None,
            "dea": round(float(dea.iloc[i]), 4) if not pd.isna(dea.iloc[i]) else None,
            "histogram": round(float(histogram.iloc[i]), 4) if not pd.isna(histogram.iloc[i]) else None,
        })
    return result


def calc_rsi(closes: list[float], period: int = 14) -> list[Optional[float]]:
    """Calculate RSI values. Returns list of RSI values (None for first `period` entries)."""
    if len(closes) < period + 1:
        return [None] * len(closes)
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.zeros(len(closes))
    avg_loss = np.zeros(len(closes))
    avg_gain[period] = np.mean(gains[:period])
    avg_loss[period] = np.mean(losses[:period])
    for i in range(period + 1, len(closes)):
        avg_gain[i] = (avg_gain[i-1] * (period - 1) + gains[i-1]) / period
        avg_loss[i] = (avg_loss[i-1] * (period - 1) + losses[i-1]) / period
    rsi = np.zeros(len(closes))
    for i in range(period, len(closes)):
        if avg_loss[i] == 0:
            rsi[i] = 100.0
        else:
            rs = avg_gain[i] / avg_loss[i]
            rsi[i] = 100.0 - (100.0 / (1.0 + rs))
    return [round(float(rsi[i]), 2) if i >= period and rsi[i] >= 0 else None
            for i in range(len(closes))]


def calc_ma(closes: list[float], periods: list[int] = [5, 10, 20, 60]) -> dict[str, list[Optional[float]]]:
    """Calculate Moving Averages. Returns {f"ma{p}": [values]}."""
    result = {}
    for p in periods:
        ma_series = pd.Series(closes).rolling(window=p).mean()
        result[f"ma{p}"] = [round(float(v), 2) if not pd.isna(v) else None
                            for v in ma_series.tolist()]
    return result


def calc_bollinger(closes: list[float], period: int = 20,
                   std_dev: int = 2) -> dict[str, list[Optional[float]]]:
    """Calculate Bollinger Bands."""
    ma = pd.Series(closes).rolling(window=period).mean()
    std = pd.Series(closes).rolling(window=period).std()
    upper = ma + std_dev * std
    lower = ma - std_dev * std
    return {
        "middle": [round(float(v), 2) if not pd.isna(v) else None for v in ma.tolist()],
        "upper": [round(float(v), 2) if not pd.isna(v) else None for v in upper.tolist()],
        "lower": [round(float(v), 2) if not pd.isna(v) else None for v in lower.tolist()],
    }
