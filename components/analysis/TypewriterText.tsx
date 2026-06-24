"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface TypewriterTextProps {
  text: string;
  /** Characters per second. Default 40. */
  speed?: number;
  /** Called when animation finishes. */
  onDone?: () => void;
  /** Additional CSS class for the text element. */
  className?: string;
}

/**
 * Hook: drives character-by-character typewriter animation.
 * Uses setTimeout + batch updates (4 chars per frame) to avoid
 * excessive React re-renders.
 */
function useTypewriter(text: string, speed: number) {
  const [displayed, setDisplayed] = useState("");
  const [isDone, setIsDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    idxRef.current = 0;
    setDisplayed("");
    setIsDone(false);

    if (!text) {
      setIsDone(true);
      return;
    }

    const BATCH = 4;
    const baseDelay = 1000 / speed;

    const tick = () => {
      const i = idxRef.current;
      if (i >= text.length) {
        setIsDone(true);
        return;
      }

      const next = Math.min(i + BATCH, text.length);
      setDisplayed(text.slice(0, next));
      idxRef.current = next;

      let extraPause = 0;
      for (let j = i; j < next && j < text.length; j++) {
        const ch = text[j];
        if (ch === "\n" || ch === "。" || ch === "！" || ch === "？") {
          extraPause += baseDelay * 2;
        } else if (ch === "，" || ch === "," || ch === "、") {
          extraPause += baseDelay;
        }
      }

      timerRef.current = window.setTimeout(tick, baseDelay * BATCH + extraPause);
    };

    timerRef.current = window.setTimeout(tick, 0);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, speed]);

  return { displayed, isDone };
}

/**
 * Renders text with a typewriter character-by-character effect
 * and a blinking cursor that disappears when done.
 */
export function TypewriterText({
  text,
  speed = 40,
  onDone,
  className = "",
}: TypewriterTextProps) {
  const { displayed, isDone } = useTypewriter(text, speed);
  const prevDone = useRef(false);

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true;
      onDone?.();
    }
  }, [isDone, onDone]);

  if (!text) return null;

  return (
    <span className={className}>
      {displayed}
      {!isDone && (
        <span className="blink-cursor inline-block w-[2px] h-[1em] bg-zinc-400 align-middle ml-0.5" />
      )}
    </span>
  );
}
