// 構造化ロガーおよびリクエストトレーサビリティユーティリティ
import crypto from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: number | string;
  path?: string;
  method?: string;
  durationMs?: number;
  statusCode?: number;
  [key: string]: unknown;
}

/**
 * リクエストヘッダーからRequestIdを抽出、または新規生成します
 */
export function getOrCreateRequestId(request?: Request | null): string {
  if (!request) {
    return crypto.randomUUID();
  }
  const existing =
    request.headers.get("x-request-id") ||
    request.headers.get("x-correlation-id") ||
    request.headers.get("traceparent");

  if (existing && existing.trim()) {
    return existing.trim();
  }
  return crypto.randomUUID();
}

/**
 * ログ出力用フォーマッター（本番はJSON、開発時は可読性重視）
 */
function outputLog(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const isProduction = process.env.NODE_ENV === "production";
  const timestamp = new Date().toISOString();

  let errorDetails: Record<string, unknown> | undefined;
  if (error instanceof Error) {
    errorDetails = {
      name: error.name,
      message: error.message,
      stack: isProduction ? error.stack?.split("\n").slice(0, 5).join("\n") : error.stack,
    };
  } else if (error !== undefined) {
    errorDetails = { raw: String(error) };
  }

  const logPayload = {
    timestamp,
    level,
    message,
    ...(context || {}),
    ...(errorDetails ? { error: errorDetails } : {}),
  };

  if (isProduction) {
    const jsonStr = JSON.stringify(logPayload);
    if (level === "error") {
      console.error(jsonStr);
    } else if (level === "warn") {
      console.warn(jsonStr);
    } else {
      console.log(jsonStr);
    }
  } else {
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const reqStr = context?.requestId ? ` [req:${context.requestId.slice(0, 8)}]` : "";
    const pathStr = context?.method && context?.path ? ` ${context.method} ${context.path}` : "";
    const mainMsg = `${prefix}${reqStr}${pathStr} ${message}`;

    if (level === "error") {
      console.error(mainMsg, error || "", context || "");
    } else if (level === "warn") {
      console.warn(mainMsg, context || "");
    } else {
      console.log(mainMsg, context || "");
    }
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== "production" || process.env.LOG_LEVEL === "debug") {
      outputLog("debug", message, context);
    }
  },
  info(message: string, context?: LogContext) {
    outputLog("info", message, context);
  },
  warn(message: string, context?: LogContext, error?: unknown) {
    outputLog("warn", message, context, error);
  },
  error(message: string, context?: LogContext, error?: unknown) {
    outputLog("error", message, context, error);
  },
};
