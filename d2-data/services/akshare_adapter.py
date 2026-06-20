"""akshare data adapter — single entry point for all akshare calls."""

import akshare as ak
import pandas as pd
from typing import Optional


def get_kline(symbol: str, period: str = "daily", count: int = 120,
              adjust: str = "qfq") -> list[dict]:
    """Get A-share K-line data. symbol format: '600519' (sh), '000001' (sz)."""
    # Determine market prefix for akshare
    code = _normalize_symbol(symbol)
    try:
        df = ak.stock_zh_a_hist(
            symbol=code, period=period,
            start_date="", end_date="",
            adjust=adjust
        )
    except Exception:
        # Fallback: try without market prefix
        df = ak.stock_zh_a_hist(
            symbol=symbol, period=period,
            start_date="", end_date="",
            adjust=adjust
        )
    if df is None or df.empty:
        return []
    bars = df.tail(count).to_dict(orient="records")
    return _format_kline_bars(bars, adjust)


def _normalize_symbol(symbol: str) -> str:
    """Convert symbol to akshare format if needed."""
    symbol = symbol.strip()
    if len(symbol) == 6:
        if symbol.startswith(("6", "9")):
            return symbol  # Shanghai
        elif symbol.startswith(("0", "3", "2")):
            return symbol  # Shenzhen/Beijing
        elif symbol.startswith(("4", "8")):
            return symbol  # Beijing
    return symbol


def _format_kline_bars(bars: list[dict], adjust: str) -> list[dict]:
    """Format raw akshare output to standardized bar format."""
    result = []
    for row in bars:
        result.append({
            "date": str(row.get("日期", "")),
            "open": float(row.get("开盘", 0)),
            "high": float(row.get("最高", 0)),
            "low": float(row.get("最低", 0)),
            "close": float(row.get("收盘", 0)),
            "volume": float(row.get("成交量", 0)),
            "amount": float(row.get("成交额", 0)) if "成交额" in row else None,
        })
    return result


def get_stock_info(symbol: str) -> dict | None:
    """Get basic stock information."""
    try:
        df = ak.stock_individual_info_em(symbol=symbol)
        if df is None or df.empty:
            return None
        info = {}
        for _, row in df.iterrows():
            info[row["item"]] = row["value"]
        return {
            "symbol": symbol,
            "name": info.get("股票简称", ""),
            "industry": info.get("行业", ""),
            "marketCap": _parse_float(info.get("总市值", "0")),
            "totalShares": _parse_float(info.get("总股本", "0")),
        }
    except Exception:
        return None


def _parse_float(value: str) -> float:
    """Parse numeric strings with unit suffixes like '1.2万亿'."""
    import re
    value = str(value).replace(",", "").strip()
    if "万亿" in value:
        return float(re.sub(r"[万亿]", "", value)) * 1e12
    elif "亿" in value:
        return float(re.sub(r"[亿]", "", value)) * 1e8
    elif "万" in value:
        return float(re.sub(r"[万]", "", value)) * 1e4
    try:
        return float(value)
    except ValueError:
        return 0.0
