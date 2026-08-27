import type {
  WatchdockCaptureContext,
  WatchdockEventPayload,
  WatchdockExceptionPayload,
  WatchdockScope,
  WatchdockServerPayload,
  WatchdockStackFrame,
  WatchdockUserPayload,
} from "./types.js";

const DEFAULT_MAX_BODY_LENGTH = 8_000;

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  return new Error("Non-error thrown");
}

export function buildExceptionPayload(error: Error): WatchdockExceptionPayload {
  return {
    type: error.name || "Error",
    message: error.message || "Unknown error",
    stacktrace: parseStack(error.stack),
  };
}

/**
 * Parses stack traces across the three major browser engines:
 * V8/Chrome ("    at fn (file:line:col)"), Firefox/Safari ("fn@file:line:col").
 */
export function parseStack(stack?: string): WatchdockStackFrame[] {
  if (!stack) {
    return [];
  }

  return stack
    .split("\n")
    .map((line) => parseStackLine(line))
    .filter((frame): frame is WatchdockStackFrame => frame !== null);
}

function parseStackLine(line: string): WatchdockStackFrame | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "Error" || /^[A-Za-z]*Error:/.test(trimmed)) {
    return null;
  }

  // V8/Chrome/Node: "at fn (file:line:col)" or "at file:line:col"
  const v8WithFunction = /^at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/;
  const v8WithoutFunction = /^at\s+(.*?):(\d+):(\d+)$/;

  let match = trimmed.match(v8WithFunction);
  if (match) {
    return {
      function: match[1],
      filename: normalizeFilename(match[2]),
      lineno: Number(match[3]),
      colno: Number(match[4]),
    };
  }

  match = trimmed.match(v8WithoutFunction);
  if (match) {
    return {
      filename: normalizeFilename(match[1]),
      lineno: Number(match[2]),
      colno: Number(match[3]),
    };
  }

  // Firefox/Safari: "fn@file:line:col" or "@file:line:col"
  const gecko = /^(.*?)@(.*?):(\d+):(\d+)$/;
  match = trimmed.match(gecko);
  if (match) {
    return {
      function: match[1] || undefined,
      filename: normalizeFilename(match[2]),
      lineno: Number(match[3]),
      colno: Number(match[4]),
    };
  }

  return null;
}

function normalizeFilename(filename: string): string {
  if (filename.startsWith("file://")) {
    return filename.replace("file://", "");
  }
  return filename;
}

export function buildServerPayload(appName?: string, server?: WatchdockServerPayload): WatchdockServerPayload {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const loc = typeof location !== "undefined" ? location : undefined;

  return {
    hostname: server?.hostname || loc?.hostname,
    runtime: server?.runtime || "browser",
    platform: server?.platform || nav?.platform,
    user_agent: server?.user_agent || nav?.userAgent,
    app_name: appName,
    ...server,
  };
}

export function buildRequestPayload(request?: WatchdockCaptureContext["request"]) {
  const loc = typeof location !== "undefined" ? location : undefined;
  const doc = typeof document !== "undefined" ? document : undefined;

  return {
    url: request?.url || loc?.href,
    referrer: request?.referrer || doc?.referrer || undefined,
    headers: request?.headers,
    query_params: request?.query_params,
  };
}

export function mergeScope(
  scope: WatchdockScope | undefined,
  context: WatchdockCaptureContext | undefined,
): WatchdockCaptureContext {
  return {
    ...context,
    request: {
      ...(scope?.request ?? {}),
      ...(context?.request ?? {}),
    },
    user: {
      ...(scope?.user ?? {}),
      ...(context?.user ?? {}),
    },
    server: {
      ...(scope?.server ?? {}),
      ...(context?.server ?? {}),
    },
  };
}

export function sanitizeEvent(event: WatchdockEventPayload, sendPii: boolean): WatchdockEventPayload {
  const sanitizedHeaders = sanitizeHeaders(event.request?.headers ?? {}, sendPii);
  const sanitizedQuery = sanitizeQueryParams(event.request?.url, event.request?.query_params, sendPii);
  const sanitizedReferrer = sendPii
    ? event.request?.referrer
    : sanitizeQueryParams(event.request?.referrer, undefined, sendPii).url;

  return {
    ...event,
    request: event.request
      ? {
          ...event.request,
          headers: sanitizedHeaders,
          url: sanitizedQuery.url,
          query_params: sanitizedQuery.queryParams,
          referrer: sanitizedReferrer,
        }
      : undefined,
    user: sendPii ? event.user : redactUser(event.user),
  };
}

// Substring match (case-insensitive) against query-param names. Deliberately broad --
// over-redacting an innocuous param (e.g. "sort_key") is a much smaller cost than leaking
// a reset token, session id, or api key sitting in a URL.
const SENSITIVE_QUERY_PARAM_SUBSTRINGS = [
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "auth",
  "key",
  "session",
  "credential",
  "otp",
  "pin",
  "ssn",
];

function isSensitiveQueryParam(name: string): boolean {
  const lowered = name.toLowerCase();
  return SENSITIVE_QUERY_PARAM_SUBSTRINGS.some((substring) => lowered.includes(substring));
}

/**
 * Redacts sensitive query-param values from both `query_params` and the `url`/`referrer`
 * strings themselves. `url` and `referrer` are captured unconditionally by this SDK (every
 * event, not just unhandled ones) and previously had no redaction path at all -- unlike
 * every other captured field. Browser URLs routinely carry password-reset tokens, OAuth
 * callback codes, or magic-link tokens directly in the query string or `#fragment`.
 */
function sanitizeQueryParams(
  url: string | undefined,
  queryParams: Record<string, unknown> | undefined,
  sendPii: boolean,
): { url: string | undefined; queryParams: Record<string, unknown> | undefined } {
  if (sendPii) {
    return { url, queryParams };
  }

  let sanitizedParams = queryParams;
  if (queryParams) {
    sanitizedParams = {};
    for (const [key, value] of Object.entries(queryParams)) {
      sanitizedParams[key] = isSensitiveQueryParam(key)
        ? Array.isArray(value)
          ? value.map(() => "[REDACTED]")
          : "[REDACTED]"
        : value;
    }
  }

  let sanitizedUrl = url;
  if (url) {
    try {
      const parsed = new URL(url);
      let changed = false;
      if (parsed.search) {
        const keys: string[] = [];
        parsed.searchParams.forEach((_value, key) => keys.push(key));
        for (const key of keys) {
          if (isSensitiveQueryParam(key)) {
            parsed.searchParams.set(key, "[REDACTED]");
            changed = true;
          }
        }
      }
      // Hash-based tokens (OAuth implicit-flow `#access_token=...`, magic links) are
      // just as sensitive as query params but never go through the search-params API.
      if (parsed.hash && parsed.hash.length > 1) {
        const hashParams = new URLSearchParams(parsed.hash.slice(1));
        const hashKeys: string[] = [];
        hashParams.forEach((_value, key) => hashKeys.push(key));
        let hashChanged = false;
        for (const key of hashKeys) {
          if (isSensitiveQueryParam(key)) {
            hashParams.set(key, "[REDACTED]");
            hashChanged = true;
          }
        }
        if (hashChanged) {
          parsed.hash = hashParams.toString();
          changed = true;
        }
      }
      if (changed) {
        sanitizedUrl = parsed.toString();
      }
    } catch {
      // Not a fully-qualified URL -- leave as-is rather than throw.
    }
  }

  return { url: sanitizedUrl, queryParams: sanitizedParams };
}

function sanitizeHeaders(headers: Record<string, string>, sendPii: boolean): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (normalized === "authorization" || normalized === "cookie" || normalized === "set-cookie") {
      result[key] = "[REDACTED]";
      continue;
    }

    if (!sendPii && normalized === "x-forwarded-for") {
      result[key] = "[REDACTED]";
      continue;
    }

    result[key] = value;
  }

  return result;
}

function redactUser(user?: WatchdockUserPayload): WatchdockUserPayload | undefined {
  if (!user) {
    return undefined;
  }

  const redacted: WatchdockUserPayload = {};
  if (user.id !== undefined) {
    redacted.id = user.id;
  }
  if (user.username !== undefined) {
    redacted.username = user.username;
  }
  return Object.keys(redacted).length ? redacted : undefined;
}

export function normalizeUrl(input: string): string {
  if (!input) {
    return input;
  }
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }
  return `https://${input}`;
}

export function truncate(value: string, maxLength: number = DEFAULT_MAX_BODY_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
