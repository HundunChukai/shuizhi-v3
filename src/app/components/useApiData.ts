// C2：降级核心数据钩子。
// useApiData<T>(path, fallback, opts) → { data, source, updatedAt, error, reload }
//  - 首帧 data = fallback（页面今天 import 的那份内置数据）：无后端也立即完整渲染、无白屏。
//  - useEffect 内 fetch：成功 → data=API 值、source="api"；失败/取消 → 回退 fallback、source="mock"。
//  - refreshInterval>0 轮询；cleanup 清定时器 + abort（兼容 StrictMode 双挂载 / 组件卸载）。
//  - C6：轮询采用自调度 setTimeout——页面隐藏(document.visibilityState==='hidden')暂停、恢复可见立即重取；
//         连续失败按 2^n 指数退避（上限 8×），后端长时间不可达时避免高频重试；成功即复位。
//  - fallback 用 ref 持有、不进依赖数组：调用方传内联字面量也不会触发无限重取。
//  - 单飞 + TTL 缓存由 apiClient 承担：多组件订阅同一 path 只发一次网络请求。
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, invalidateCache } from "../lib/apiClient";

export type DataKind = "api" | "mock";

export interface UseApiDataOptions {
  // >0 时按毫秒轮询（如 live 模式 15s）；0/省略表示只取一次。
  refreshInterval?: number;
  // false 或 path=null 时不请求，直接以 fallback 呈现（demo 模式本地算数据时用）。
  enabled?: boolean;
  timeoutMs?: number;
}

export interface UseApiDataResult<T> {
  data: T;
  source: DataKind;
  updatedAt: number | null;
  error: Error | null;
  // 列表接口在 meta 中返回的命中总数（分页口径）。非列表接口/降级时为 null。
  total: number | null;
  // 失效该 path 缓存并立即重取（C7 写成功后调用）。
  reload: () => void;
}

export function useApiData<T>(
  path: string | null,
  fallback: T,
  options: UseApiDataOptions = {},
): UseApiDataResult<T> {
  const { refreshInterval = 0, enabled = true, timeoutMs } = options;
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<DataKind>("mock");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  // 始终持有最新 fallback，但不作为 effect 依赖（避免内联字面量导致的重渲染风暴）。
  const fallbackRef = useRef<T>(fallback);
  fallbackRef.current = fallback;

  const active = enabled && path != null;

  useEffect(() => {
    if (!active || path == null) {
      setData(fallbackRef.current);
      setSource("mock");
      setError(null);
      setTotal(null);
      return;
    }

    const controller = new AbortController();
    let alive = true;
    let timer: number | undefined;
    let failures = 0;
    const polling = refreshInterval > 0;

    const schedule = (delayMs: number): void => {
      if (!alive || !polling) return;
      // 页面不可见时暂停轮询，待 visibilitychange 恢复可见再续。
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      timer = window.setTimeout(run, delayMs);
    };

    const run = (): void => {
      if (!alive) return;
      apiGet<T>(path, { signal: controller.signal, timeoutMs })
        .then((env) => {
          if (!alive) return;
          failures = 0;
          setData(env.data);
          setSource("api");
          setUpdatedAt(typeof env.meta.generatedAt === "number" ? env.meta.generatedAt : Date.now());
          setTotal(typeof env.meta.total === "number" ? env.meta.total : null);
          setError(null);
          schedule(refreshInterval);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          // 降级：回退到内置数据，chip 显示「内置模拟」，页面继续可用。
          setData(fallbackRef.current);
          setSource("mock");
          setTotal(null);
          setError(err instanceof Error ? err : new Error(String(err)));
          // 连续失败指数退避：refreshInterval × 2^(n-1)，封顶 8×。
          failures += 1;
          schedule(refreshInterval * Math.min(8, 2 ** (failures - 1)));
        });
    };

    run();

    // 隐藏→暂停（取消待执行的定时器）；恢复可见→立即重取并续上轮询。
    const onVisibilityChange = (): void => {
      if (!polling) return;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (document.visibilityState === "visible") run();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      alive = false;
      controller.abort();
      if (timer != null) window.clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [path, active, refreshInterval, timeoutMs, nonce]);

  const reload = useCallback(() => {
    if (path) invalidateCache(path);
    setNonce((n) => n + 1);
  }, [path]);

  return { data, source, updatedAt, error, total, reload };
}
