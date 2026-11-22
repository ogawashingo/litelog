// Stale-While-Revalidate（SWR）パターンのクライアントデータフェッチ＆キャッシュ管理レイヤー
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface FetchOptions<T> {
  dedupingInterval?: number; // 同一キーの重複リクエストを抑制するミリ秒（デフォルト: 2000ms）
  revalidateOnFocus?: boolean; // ウィンドウフォーカス時の自動再検証（デフォルト: true）
  refreshInterval?: number; // 定期ポーリング間隔（ミリ秒）
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

// グローバルキャッシュストア
const cache = new Map<string, CacheEntry<unknown>>();
// 実行中（インフライト）のリクエストプロミス（重複フェッチ排除用）
const inflightRequests = new Map<string, Promise<unknown>>();
// キーごとの購読リスナー
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, listener: () => void) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key)!.add(listener);
  return () => {
    const set = listeners.get(key);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(key);
      }
    }
  };
}

function notify(key: string) {
  const set = listeners.get(key);
  if (set) {
    set.forEach((listener) => listener());
  }
}

/**
 * 任意のコンポーネントから指定したキーのキャッシュを手動更新・再検証します
 */
export async function globalMutate<T>(
  key: string,
  dataOrUpdater?: T | ((current: T | undefined) => T) | Promise<T>,
  shouldRevalidate = true
): Promise<T | undefined> {
  if (dataOrUpdater !== undefined) {
    let resolvedData: T;
    if (typeof dataOrUpdater === "function") {
      const currentEntry = cache.get(key);
      const currentData = currentEntry ? (currentEntry.data as T) : undefined;
      resolvedData = (dataOrUpdater as (c: T | undefined) => T)(currentData);
    } else {
      resolvedData = await dataOrUpdater;
    }
    cache.set(key, { data: resolvedData, timestamp: Date.now() });
    notify(key);
  }

  if (shouldRevalidate) {
    notify(key);
  }

  const entry = cache.get(key);
  return entry ? (entry.data as T) : undefined;
}

/**
 * デフォルトのJSONフェッチャー
 */
export async function defaultFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorJson = await res.json();
      errorMessage = errorJson.detail || errorJson.error || errorMessage;
    } catch {
      // JSONパース失敗時はステータスコードを保持
    }
    const error = new Error(errorMessage);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * SWR（Stale-While-Revalidate）パターンのデータフェッチカスタムフック
 *
 * @param key フェッチ対象のURLまたは一意のキャッシュキー（null/空文字でフェッチ停止）
 * @param fetcher データを取得する非同期関数（デフォルトはfetch APIによるJSON取得）
 * @param options キャッシュ設定・再検証オプション
 */
export function useDataFetch<T = unknown>(
  key: string | null | undefined,
  fetcher: (url: string) => Promise<T> = defaultFetcher,
  options: FetchOptions<T> = {}
) {
  const {
    dedupingInterval = 2000,
    revalidateOnFocus = true,
    refreshInterval = 0,
    initialData,
    onSuccess,
    onError,
  } = options;

  const initialEntry = key ? (cache.get(key) as CacheEntry<T> | undefined) : undefined;

  const [data, setData] = useState<T | undefined>(() => {
    if (initialEntry) return initialEntry.data;
    return initialData;
  });
  const [error, setError] = useState<Error | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!initialEntry && !initialData && Boolean(key));

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // データ再検証フェッチ関数
  const revalidate = useCallback(
    async (ignoreDeduping = false): Promise<T | undefined> => {
      if (!key) return undefined;

      const now = Date.now();
      const existingEntry = cache.get(key) as CacheEntry<T> | undefined;

      // 重複期間内であれば既存キャッシュを返す（多重リクエスト抑制）
      if (!ignoreDeduping && existingEntry && now - existingEntry.timestamp < dedupingInterval) {
        setData(existingEntry.data);
        return existingEntry.data;
      }

      setIsValidating(true);

      // 同一キーに対する進行中リクエストがあれば再利用
      let promise = inflightRequests.get(key) as Promise<T> | undefined;
      if (!promise) {
        promise = fetcherRef.current(key);
        inflightRequests.set(key, promise);
      }

      try {
        const result = await promise;
        cache.set(key, { data: result, timestamp: Date.now() });
        setData(result);
        setError(null);
        setIsLoading(false);
        optionsRef.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setIsLoading(false);
        optionsRef.current.onError?.(errorObj);
        return undefined;
      } finally {
        inflightRequests.delete(key);
        setIsValidating(false);
      }
    },
    [key, dedupingInterval]
  );

  // キャッシュ変更の購読
  useEffect(() => {
    if (!key) return;

    // キャッシュにデータがあれば即時反映（Stale-While-Revalidate）
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      setData(entry.data);
      setIsLoading(false);
    }

    // 初回フェッチ
    revalidate();

    // 他コンポーネントからのキャッシュ更新を監視
    const unsubscribe = subscribe(key, () => {
      const updated = cache.get(key) as CacheEntry<T> | undefined;
      if (updated) {
        setData(updated.data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [key, revalidate]);

  // ウィンドウフォーカス時の再検証
  useEffect(() => {
    if (!revalidateOnFocus || !key) return;

    const handleFocus = () => {
      revalidate();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleFocus);
    };
  }, [key, revalidateOnFocus, revalidate]);

  // 定期ポーリング
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || !key) return;

    const timer = setInterval(() => {
      revalidate(true);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [key, refreshInterval, revalidate]);

  // ローカルmutate
  const mutate = useCallback(
    async (
      dataOrUpdater?: T | ((current: T | undefined) => T) | Promise<T>,
      shouldRevalidate = true
    ) => {
      if (!key) return undefined;
      return globalMutate(key, dataOrUpdater, shouldRevalidate);
    },
    [key]
  );

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
    revalidate,
  };
}
