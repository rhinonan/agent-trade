"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface TypewriterTextProps {
  text: string;
  /** Characters per second. Default 100. */
  speed?: number;
  /** Optional ref for burst mode. When non-null, overrides `speed` without resetting the animation. */
  burstSpeedRef?: React.MutableRefObject<number | null>;
  /** Called when animation finishes. */
  onDone?: () => void;
  /** Additional CSS class for the text element. */
  className?: string;
}

/**
 * Hook: drives character-by-character typewriter animation.
 * Uses setTimeout + batch updates to avoid excessive React re-renders.
 *
 * `burstSpeedRef` is read on each tick but NOT included in the useEffect
 * dependency array — changing it mid-animation does NOT reset the animation.
 */
function useTypewriter(
  text: string,
  speed: number,
  burstSpeedRef?: React.MutableRefObject<number | null>,
) {
  const [displayed, setDisplayed] = useState("");
  const [isDone, setIsDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const idxRef = useRef(0);

  const skip = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDisplayed(text);
    idxRef.current = text.length;
    setIsDone(true);
  }, [text]);

  useEffect(() => {
    idxRef.current = 0;
    setDisplayed("");
    setIsDone(false);

    if (!text) {
      setIsDone(true);
      return;
    }

    const BATCH = 10;

    // Read effective speed fresh on each tick so burst changes apply
    // mid-animation without triggering the useEffect cleanup.
    const getBaseDelay = () => {
      const effectiveSpeed = burstSpeedRef?.current ?? speed;
      return 1000 / effectiveSpeed;
    };

    const tick = () => {
      const i = idxRef.current;
      if (i >= text.length) {
        setIsDone(true);
        return;
      }

      const baseDelay = getBaseDelay();
      const next = Math.min(i + BATCH, text.length);
      setDisplayed(text.slice(0, next));
      idxRef.current = next;

      // Light punctuation pause for natural feel without slowing too much
      let extraPause = 0;
      for (let j = i; j < next && j < text.length; j++) {
        const ch = text[j];
        if (ch === "\n" || ch === "。" || ch === "！" || ch === "？") {
          extraPause += baseDelay * 0.5;
        }
        // Commas no longer add extra pause for faster feel
      }

      timerRef.current = window.setTimeout(
        tick,
        baseDelay * BATCH + extraPause,
      );
    };

    timerRef.current = window.setTimeout(tick, 0);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, speed]);
  // NOTE: burstSpeedRef is intentionally NOT in the dependency array.
  // Changing ref.current does NOT reset the animation — it picks up the
  // new speed on the next tick boundary seamlessly.

  return { displayed, isDone, skip };
}

/**
 * Renders text with a typewriter character-by-character effect
 * and a blinking cursor that disappears when done.
 * Click anywhere on the text to skip to the end instantly.
 */
export function TypewriterText({
  text,
  speed = 100,
  burstSpeedRef,
  onDone,
  className = "",
}: TypewriterTextProps) {
  const { displayed, isDone, skip } = useTypewriter(text, speed, burstSpeedRef);
  const prevDone = useRef(false);

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true;
      onDone?.();
    }
  }, [isDone, onDone]);

  if (!text) return null;

  return (
    <div
      className={`${className} whitespace-pre-wrap break-words ${
        !isDone ? "cursor-pointer" : ""
      }`}
      onClick={() => {
        if (!isDone) skip();
      }}
      title={!isDone ? "点击跳过动画" : undefined}
    >
      {displayed}
      {!isDone && (
        <span className="blink-cursor inline-block w-[2px] h-[1em] bg-zinc-400 align-middle ml-0.5" />
      )}
      {!isDone && (
        <span className="text-[10px] text-zinc-600 ml-1.5 align-middle">
          点击跳过
        </span>
      )}
    </div>
  );
}
