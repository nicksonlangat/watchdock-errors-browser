# Watchdock Errors Browser

Watchdock's error tracking SDK for browser and React frontends.

It captures unhandled errors, unhandled promise rejections, and manually reported errors/messages from client-side JavaScript, and sends them to:

- `POST /api/v1/error-events/`

For Node.js backends, use [`watchdock-errors`](https://www.npmjs.com/package/watchdock-errors) instead — this package requires a `window`.

## Install

```bash
npm install watchdock-errors-browser
```

## Quick Start

```ts
import { init, captureException, captureMessage } from "watchdock-errors-browser";

init({
  apiKey: "wdk_your_tracking_key",
  environment: "production",
  release: "1.0.0",
  appName: "dashboard-web",
  sendPii: false,
});

try {
  riskyOperation();
} catch (error) {
  captureException(error);
}

captureMessage("Background sync completed with warnings");

// Override the default level via context
captureMessage("Queue depth high", { level: "warning" });
```

By default, `init()` also wires up `window.onerror` and `window.onunhandledrejection` listeners, so uncaught exceptions and unhandled promise rejections are reported automatically. Set `autoCapture: false` to disable this and rely on manual `captureException` calls only.

## React Integration

```tsx
import { WatchdockErrorBoundary } from "watchdock-errors-browser/react";

function App() {
  return (
    <WatchdockErrorBoundary fallback={(error, reset) => <button onClick={reset}>Something broke — retry</button>}>
      <Dashboard />
    </WatchdockErrorBoundary>
  );
}
```

Or wrap a component with the HOC:

```tsx
import { withWatchdockErrorBoundary } from "watchdock-errors-browser/react";

export default withWatchdockErrorBoundary(Dashboard, {
  fallback: <p>Something went wrong.</p>,
});
```

`WatchdockErrorBoundary` only catches errors thrown during React rendering (per React's error boundary semantics) — it does not replace the global `window.onerror`/`unhandledrejection` auto-capture.

## Associating a user

Browser sessions don't have per-request isolation like a server does, so user context is set once and merged into every subsequent event:

```ts
import { setUser, clearScope } from "watchdock-errors-browser";

setUser({ id: "42", email: "user@example.com", username: "nick" });

// On logout:
clearScope();
```

## API

### `init(options)`

```ts
init({
  apiKey: "wdk_xxx",
  endpoint: "https://api.watchdock.cc/api/v1/error-events/",
  environment: "production",
  release: "1.2.3",
  appName: "dashboard-web",
  sendPii: false,
  autoCapture: true,
  beforeSend: async (event) => {
    delete event.user?.email;
    return event;
  },
  onError: (error) => {
    console.error("Watchdock send failed", error);
  },
});
```

### `captureException(error, context?)`

Captures an `Error` object or any thrown value. Defaults to `level: "error"` unless overridden via `context.level`.

### `captureMessage(message, context?)`

Captures a non-exception event as a `"Message"` issue. Defaults to `level: "info"` unless overridden via `context.level`.

### `flush()`

Waits for any queued sends to finish. Useful before navigating away or unmounting.

### Event levels

Every event carries a `level`. `captureException` defaults to `"error"`; `captureMessage` defaults to `"info"`. Override either via `context.level`.

## Notes

- The SDK authenticates with `Authorization: Bearer wdk_...`.
- Request headers like `Authorization` and `Cookie` are always redacted if present.
- When `sendPii` is `false`, the user's `email` is omitted (only `id`/`username` are sent).
- Stack traces are parsed across Chrome/V8, Firefox, and Safari stack formats.
- On `init()`, the SDK schedules a one-time, fire-and-forget ping to the platform (with the SDK version and environment) to register that it started up. This never blocks startup and any failure is silently ignored.
- Requires a browser environment (`window`) — for Node.js backends use [`watchdock-errors`](https://www.npmjs.com/package/watchdock-errors) instead.
