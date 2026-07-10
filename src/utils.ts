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
    };
  }

  match = trimmed.match(v8WithoutFunction);
  if (match) {
    return {
      filename: normalizeFilename(match[1]),
      lineno: Number(match[2]),
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

  return {
    ...event,
    request: event.request
      ? {
          ...event.request,
          headers: sanitizedHeaders,
        }
      : undefined,
    user: sendPii ? event.user : redactUser(event.user),
  };
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
