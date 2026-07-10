import type { WatchdockScope } from "./types.js";

let currentScope: WatchdockScope = {};

/**
 * Browser SDKs don't have per-request isolation like a server does — there's
 * one scope for the whole tab/session. Use this to attach the current user
 * (and any other context) once after login, and it's merged into every event.
 */
export function setScope(scope: WatchdockScope): void {
  currentScope = { ...currentScope, ...scope };
}

export function setUser(user: WatchdockScope["user"]): void {
  currentScope = { ...currentScope, user };
}

export function clearScope(): void {
  currentScope = {};
}

export function getCurrentScope(): WatchdockScope {
  return currentScope;
}
