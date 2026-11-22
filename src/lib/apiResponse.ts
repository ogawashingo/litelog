// RFC 7807 (Problem Details for HTTP APIs) 準拠のエラーレスポンスおよび統一APIレスポンスユーティリティ
import { NextResponse } from "next/server";
import { getOrCreateRequestId } from "@/lib/logger";

export interface ApiErrorOptions {
  status: number;
  title?: string;
  detail: string;
  code?: string;
  type?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
  request?: Request | null;
  headers?: Record<string, string>;
}

const DEFAULT_TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

/**
 * RFC 7807に準拠しつつ、既存フロントエンドとの完全な後方互換性（errorプロパティ）を保ったエラーレスポンスを生成します
 */
export function apiError(options: ApiErrorOptions): NextResponse {
  const {
    status,
    title = DEFAULT_TITLES[status] || "Error",
    detail,
    code,
    type = `https://litelog.local/errors/${code || status}`,
    invalidParams,
    request,
    headers: extraHeaders = {},
  } = options;

  const requestId = getOrCreateRequestId(request);
  const path = request ? new URL(request.url).pathname : undefined;

  const body = {
    // 既存コードとの後方互換性（data.error で参照されるため）
    error: detail,
    // RFC 7807 準拠フィールド
    type,
    title,
    status,
    detail,
    instance: path,
    code,
    invalidParams,
    requestId,
    timestamp: new Date().toISOString(),
  };

  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/problem+json; charset=utf-8");
  headers.set("X-Request-Id", requestId);

  return NextResponse.json(body, {
    status,
    headers,
  });
}

/**
 * 統一された成功レスポンスを生成します（X-Request-Id ヘッダー付き）
 */
export function apiSuccess<T>(data: T, init?: ResponseInit, request?: Request | null): NextResponse<T> {
  const requestId = getOrCreateRequestId(request);
  const headers = new Headers(init?.headers);
  headers.set("X-Request-Id", requestId);

  return NextResponse.json(data, {
    ...init,
    headers,
  });
}
