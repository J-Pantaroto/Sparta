import {
  ExternalServiceError,
  publicMessageForExternalError,
  type ExternalErrorCode,
  type IntegrationId
} from "./external-service-error.js";

export const HTTP_TIMEOUTS = {
  riotApiMs: 10_000,
  dataDragonMs: 8_000,
  remoteAssetMs: 10_000,
  spartaApiMs: 10_000,
  lcuMs: 1_500,
  transactionalEmailMs: 8_000
} as const;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxTotalDurationMs: number;
  jitterRatio: number;
  retryTimeouts: boolean;
  retryStatuses: ReadonlySet<number>;
}

export const NO_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  baseDelayMs: 0,
  maxDelayMs: 0,
  maxTotalDurationMs: 0,
  jitterRatio: 0,
  retryTimeouts: false,
  retryStatuses: new Set()
};

export const RIOT_GET_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
  maxTotalDurationMs: 20_000,
  jitterRatio: 0.2,
  retryTimeouts: true,
  retryStatuses: new Set([429, 502, 503, 504])
};

type FetchLike = (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>;

export interface HttpPolicyOptions {
  integration: IntegrationId;
  timeoutMs: number;
  request?: RequestInit;
  idempotent?: boolean;
  retryPolicy?: RetryPolicy;
  throwOnHttpError?: boolean;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

function parseRetryAfter(value: string | null, now: () => number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now());
}

function classifyHttpError(
  integration: IntegrationId,
  status: number,
  retryAfterMs: number | undefined,
  retryPolicy: RetryPolicy
): ExternalServiceError {
  let code: ExternalErrorCode;
  if (integration === "RIOT_API" && (status === 401 || status === 403)) code = "RIOT_CREDENTIAL_INVALID";
  else if (integration === "RIOT_API" && status === 429) code = "RIOT_RATE_LIMITED";
  else if (status === 404) code = "UPSTREAM_NOT_FOUND";
  else code = "UPSTREAM_UNAVAILABLE";

  const temporary = status === 429 || status === 502 || status === 503 || status === 504;
  return new ExternalServiceError({
    code,
    integration,
    message: publicMessageForExternalError(code),
    status,
    retryAfterMs,
    temporary,
    retryable: temporary && retryPolicy.retryStatuses.has(status)
  });
}

function shouldRetry(
  error: ExternalServiceError,
  attempt: number,
  startedAt: number,
  policy: RetryPolicy,
  idempotent: boolean,
  now: () => number
): boolean {
  if (!idempotent || !error.temporary || !error.retryable || attempt >= policy.maxAttempts) return false;
  return policy.maxTotalDurationMs <= 0 || now() - startedAt < policy.maxTotalDurationMs;
}

function backoffDelay(
  error: ExternalServiceError,
  attempt: number,
  policy: RetryPolicy,
  random: () => number
): number {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exponential * policy.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

export async function fetchWithPolicy(url: string, options: HttpPolicyOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const policy = options.retryPolicy ?? NO_RETRY_POLICY;
  const idempotent = options.idempotent ?? (options.request?.method ?? "GET").toUpperCase() === "GET";
  const startedAt = now();

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const controller = new globalThis.AbortController();
    let timedOut = false;
    const callerSignal = options.request?.signal;
    const cancelFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);

    try {
      if (callerSignal?.aborted) controller.abort();
      const response = await fetchImpl(url, {
        ...options.request,
        signal: controller.signal
      });

      if (options.throwOnHttpError !== false && !response.ok) {
        const error = classifyHttpError(
          options.integration,
          response.status,
          parseRetryAfter(response.headers.get("retry-after"), now),
          policy
        );
        if (shouldRetry(error, attempt, startedAt, policy, idempotent, now)) {
          const delay = backoffDelay(error, attempt, policy, random);
          if (policy.maxTotalDurationMs > 0 && now() - startedAt + delay > policy.maxTotalDurationMs) throw error;
          await sleep(delay);
          continue;
        }
        throw error;
      }
      // `fetch()` pode resolver assim que os headers chegam. Consumir o
      // corpo aqui mantém download e parse posteriores dentro do mesmo
      // AbortController/timeout, em vez de liberar um body que pode pendurar.
      const body = await response.arrayBuffer();
      const responseBody = [204, 205, 304].includes(response.status) ? null : body;
      return new globalThis.Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (cause) {
      const error =
        cause instanceof ExternalServiceError
          ? cause
          : new ExternalServiceError({
              code: timedOut ? "REQUEST_TIMEOUT" : callerSignal?.aborted ? "REQUEST_CANCELLED" : "NETWORK_UNAVAILABLE",
              integration: options.integration,
              message: publicMessageForExternalError(
                timedOut ? "REQUEST_TIMEOUT" : callerSignal?.aborted ? "REQUEST_CANCELLED" : "NETWORK_UNAVAILABLE"
              ),
              temporary: timedOut || !callerSignal?.aborted,
              retryable: timedOut ? policy.retryTimeouts : !callerSignal?.aborted,
              cause
            });

      if (shouldRetry(error, attempt, startedAt, policy, idempotent, now)) {
        const delay = backoffDelay(error, attempt, policy, random);
        if (policy.maxTotalDurationMs > 0 && now() - startedAt + delay > policy.maxTotalDurationMs) throw error;
        await sleep(delay);
        continue;
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", cancelFromCaller);
    }
  }

  throw new ExternalServiceError({
    code: "UPSTREAM_UNAVAILABLE",
    integration: options.integration,
    message: publicMessageForExternalError("UPSTREAM_UNAVAILABLE"),
    temporary: true,
    retryable: false
  });
}

export async function requestJson<T>(
  url: string,
  options: HttpPolicyOptions & { validate?: (payload: unknown) => payload is T }
): Promise<T> {
  const response = await fetchWithPolicy(url, options);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ExternalServiceError({
      code: "UPSTREAM_INVALID_RESPONSE",
      integration: options.integration,
      message: publicMessageForExternalError("UPSTREAM_INVALID_RESPONSE"),
      status: response.status,
      temporary: false,
      retryable: false,
      cause
    });
  }

  if (options.validate && !options.validate(payload)) {
    throw new ExternalServiceError({
      code: "UPSTREAM_INVALID_RESPONSE",
      integration: options.integration,
      message: publicMessageForExternalError("UPSTREAM_INVALID_RESPONSE"),
      status: response.status,
      temporary: false,
      retryable: false
    });
  }
  return payload as T;
}
