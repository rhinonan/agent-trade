export function parseLLMJson(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

export type Sentiment = "bullish" | "bearish" | "neutral";

const VALID_SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);

export function parseSentiment(value: unknown): Sentiment {
  if (typeof value === "string" && VALID_SENTIMENTS.has(value)) {
    return value as Sentiment;
  }
  return "neutral";
}
