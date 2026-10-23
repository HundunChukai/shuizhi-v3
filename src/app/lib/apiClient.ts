// C1：前端统一 API 客户端。
// 职责：fetch 封装 + 超时(AbortController) + 模块级单飞去重 + 15s TTL 缓存 + { data, meta } 解包。
// 设计取舍：
//  - 任何失败（网络不可达 / 超时 / 非 2xx / 非法 JSON）一律抛 ApiUnavailableError，
//    供 useApiData(C2) 捕获后静默降级到内置 fallback（GH Pages / 离线 / 无后端场景）。
//  - 单飞：同一 GET 正在进行时，后到的调用复用同一 Promise —— 避免 5 个页面各拉一次 /api/alerts。
//  - 缓存只存「成功」结果（TTL 15s）；失败不缓存，后端恢复后下一次请求立即可取。
//  - 单飞请求的内部 fetch 只受超时控制，不接调用方的 signal；调用方 abort 仅让「自己」的
//    Promise 以取消错误 reject（withAbort），不会连累共享同一请求的其它组件（如导航角标 + 驾驶舱）。
const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_TTL_MS = 15_000;

export type ApiSource = "db" | "simulator" | (string & Record<never, never>);

export interface ApiMeta {
  source?: ApiSource;
  generatedAt?: number;
  total?: number;
  page?: number;
  pageSize?: number;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

// API 不可达 / 非预期响应。降级逻辑据此判断「回退到内置数据」。
export class ApiUnavailableError extends Error {
  readonly status?: number;
  readonly cause?: unknown;
  constructor(message: string, init?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "ApiUnavailableError";
    this.status = init?.status;
    this.cause = init?.cause;
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  timeoutMs?: number;
  // 调用方取消信号（组件卸载 / 轮询切换）；对缓存 GET 只影响本次调用，不影响共享请求。
  signal?: AbortSignal;
  // 是否走缓存 + 单飞（默认仅 GET 为 true）。写操作应显式 false。
  cache?: boolean;
  ttlMs?: number;
}

interface CacheEntry {
  envelope: ApiEnvelope<unknown>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ApiEnvelope<unknown>>>();

// 自动演示等要求「真实高频刷新」的场景：忽略已写入的缓存条目（仍保留单飞去重）。
// 由 DataContext 跟随演示运行态开关，演示结束后复位——正常浏览时缓存行为完全不变。
let forceRevalidate = false;

export function setForceRevalidate(on: boolean): void {
  forceRevalidate = on;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (!base) return suffix;
  // 幂等守卫：同源前缀（如 base="/api"）且 path 已含该前缀时不重复拼接，避免 "/api/api/x"。
  if (!base.startsWith("http") && (suffix === base || suffix.startsWith(`${base}/`))) return suffix;
  return `${base}${suffix}`;
}

function keyFor(method: HttpMethod, url: string, body?: unknown): string {
  return body == null ? `${method} ${url}` : `${method} ${url} ${JSON.stringify(body)}`;
}

function normalize<T>(payload: unknown): ApiEnvelope<T> {
  // 后端统一 { data, meta }；同时容忍裸返回（无信封）以防未来端点差异。
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    const env = payload as { data: T; meta?: ApiMeta };
    return { data: env.data, meta: env.meta ?? {} };
  }
  return { data: payload as T, meta: {} };
}

// 让「调用方 signal」只中止自己拿到的 Promise，不中止底层共享 fetch。
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new ApiUnavailableError("请求已取消", { cause: "aborted" }));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ApiUnavailableError("请求已取消", { cause: "aborted" }));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

// 真正发起一次网络请求（超时 + 外部 signal 合并到一个内部 controller）。
async function request<T>(url: string, method: HttpMethod, options: RequestOptions): Promise<ApiEnvelope<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body != null) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiUnavailableError(`后端返回 HTTP ${response.status}（${method} ${url}）`, {
        status: response.status,
      });
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new ApiUnavailableError(`响应不是合法 JSON（${method} ${url}）`, { cause: err });
    }
    return normalize<T>(payload);
  } catch (err) {
    if (err instanceof ApiUnavailableError) throw err;
    const reason = controller.signal.aborted ? "请求超时或被取消" : "无法连接后端 API";
    throw new ApiUnavailableError(`${reason}（${method} ${url}）`, { cause: err });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

// 统一入口。GET 默认走缓存 + 单飞；写操作（或 cache:false）直连、不缓存。
export function fetchJson<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const method = options.method ?? "GET";
  const url = buildUrl(path);
  const useCache = options.cache ?? method === "GET";

  if (!useCache) {
    return request<T>(url, method, options);
  }

  const key = keyFor(method, url, options.body);
  // 演示运行中忽略已缓存条目：否则 5s 轮询多数命中 15s TTL 缓存，画面看起来是静止的。
  const hit = forceRevalidate ? undefined : cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return withAbort(Promise.resolve(hit.envelope as ApiEnvelope<T>), options.signal);
  }
  const pending = inflight.get(key);
  if (pending) {
    return withAbort(pending as Promise<ApiEnvelope<T>>, options.signal);
  }

  // 共享请求：不接调用方 signal（避免单个组件卸载连累其它复用者）。
  const shared = request<T>(url, method, { ...options, signal: undefined }) as Promise<ApiEnvelope<unknown>>;
  inflight.set(key, shared);
  shared
    .then((envelope) => {
      cache.set(key, { envelope, expiresAt: Date.now() + (options.ttlMs ?? DEFAULT_TTL_MS) });
    })
    .catch(() => {
      /* 失败不缓存：后端恢复后下次立即可取 */
    })
    .finally(() => {
      inflight.delete(key);
    });
  return withAbort(shared as Promise<ApiEnvelope<T>>, options.signal);
}

// 便捷读取（走缓存 + 单飞）。
export function apiGet<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<ApiEnvelope<T>> {
  return fetchJson<T>(path, { ...options, method: "GET" });
}

// 便捷写入（POST/PATCH/DELETE）：直连、不缓存。写后由调用方按需 invalidateCache 触发重取。
export function apiSend<T>(
  path: string,
  method: Exclude<HttpMethod, "GET">,
  body?: unknown,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<ApiEnvelope<T>> {
  return fetchJson<T>(path, { ...options, method, body, cache: false });
}

// 失效缓存：不传参清空全部；传路径片段（如 "/alerts"）只清相关键，供 C7 写成功后重取。
export function invalidateCache(pathHint?: string): void {
  if (!pathHint) {
    cache.clear();
    return;
  }
  const needle = pathHint.startsWith("/") ? pathHint : `/${pathHint}`;
  for (const key of [...cache.keys()]) {
    if (key.includes(needle)) cache.delete(key);
  }
}

export function apiUrl(path: string): string {
  return buildUrl(path);
}
