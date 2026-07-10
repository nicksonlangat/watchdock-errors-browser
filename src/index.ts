export { captureException, captureMessage, flush, init, isInitialized } from "./client.js";
export { clearScope, getCurrentScope, setScope, setUser } from "./scope.js";
export type {
  WatchdockCaptureContext,
  WatchdockEventPayload,
  WatchdockExceptionPayload,
  WatchdockInitOptions,
  WatchdockRequestPayload,
  WatchdockScope,
  WatchdockServerPayload,
  WatchdockStackFrame,
  WatchdockUserPayload,
} from "./types.js";
