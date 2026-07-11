export interface WatchdockStackFrame {
  filename: string;
  function?: string;
  lineno?: number;
  context_line?: string;
}

export interface WatchdockExceptionPayload {
  type: string;
  message: string;
  stacktrace?: WatchdockStackFrame[];
}

export interface WatchdockRequestPayload {
  url?: string;
  referrer?: string;
  headers?: Record<string, string>;
  query_params?: Record<string, unknown>;
}

export interface WatchdockUserPayload {
  id?: string | number;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface WatchdockServerPayload {
  hostname?: string;
  runtime?: string;
  runtime_version?: string;
  platform?: string;
  user_agent?: string;
  [key: string]: unknown;
}

export interface WatchdockSdkPayload {
  name: string;
  version: string;
}

export interface WatchdockEventPayload {
  project_key?: string;
  title?: string;
  timestamp: string;
  environment?: string;
  level?: string;
  release?: string;
  trace_id?: string;
  exception: WatchdockExceptionPayload;
  request?: WatchdockRequestPayload;
  user?: WatchdockUserPayload;
  server?: WatchdockServerPayload;
  sdk: WatchdockSdkPayload;
}

export interface WatchdockScope {
  request?: WatchdockRequestPayload;
  user?: WatchdockUserPayload;
  server?: WatchdockServerPayload;
}

export interface WatchdockCaptureContext {
  title?: string;
  environment?: string;
  level?: string;
  release?: string;
  /**
   * Correlation ID linking this event to a server-side request (e.g. an
   * `X-Request-Id` your backend echoed back in a response header). The
   * browser SDK has no incoming request to read this from automatically —
   * attach it manually if you have one.
   */
  trace_id?: string;
  request?: WatchdockRequestPayload;
  user?: WatchdockUserPayload;
  server?: WatchdockServerPayload;
  extras?: Record<string, unknown>;
}

export interface WatchdockInitOptions {
  apiKey: string;
  endpoint?: string;
  environment?: string;
  release?: string;
  appName?: string;
  sendPii?: boolean;
  /** Automatically capture uncaught errors and unhandled promise rejections. Defaults to true. */
  autoCapture?: boolean;
  beforeSend?: (event: WatchdockEventPayload) => WatchdockEventPayload | null | Promise<WatchdockEventPayload | null>;
  onError?: (error: unknown) => void;
}

export interface WatchdockClientState {
  apiKey: string;
  endpoint: string;
  environment?: string;
  release?: string;
  appName?: string;
  sendPii: boolean;
  beforeSend?: WatchdockInitOptions["beforeSend"];
  onError?: WatchdockInitOptions["onError"];
}
