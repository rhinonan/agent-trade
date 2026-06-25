/**
 * Structured logger with controllable log levels.
 *
 * Set LOG_LEVEL env var to: "error" | "warn" | "info" | "debug" | "verbose"
 * Default: "info" in development, "warn" in production.
 *
 * Usage:
 *   import { createLogger } from "@/lib/logger";
 *   const log = createLogger("debate");
 *   log.verbose("LLM call", { round: 3, role: "多方", latencyMs: 1234 });
 */

export type LogLevel = "error" | "warn" | "info" | "debug" | "verbose";

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

function resolveLogLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_RANK) return fromEnv;
  if (process.env.NODE_ENV === "production") return "warn";
  return "info";
}

const currentLevel = resolveLogLevel();
const currentRank = LEVEL_RANK[currentLevel];

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data && Object.keys(data).length > 0) {
    try {
      return `${base} ${JSON.stringify(data)}`;
    } catch {
      return `${base} [unserializable data]`;
    }
  }
  return base;
}

export interface Logger {
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  verbose(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  return {
    error(message, data) {
      if (currentRank >= LEVEL_RANK.error) {
        console.error(format("error", module, message, data));
      }
    },
    warn(message, data) {
      if (currentRank >= LEVEL_RANK.warn) {
        console.warn(format("warn", module, message, data));
      }
    },
    info(message, data) {
      if (currentRank >= LEVEL_RANK.info) {
        console.log(format("info", module, message, data));
      }
    },
    debug(message, data) {
      if (currentRank >= LEVEL_RANK.debug) {
        console.log(format("debug", module, message, data));
      }
    },
    verbose(message, data) {
      if (currentRank >= LEVEL_RANK.verbose) {
        console.log(format("verbose", module, message, data));
      }
    },
  };
}

/** Re-export the current effective log level for introspection. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}
