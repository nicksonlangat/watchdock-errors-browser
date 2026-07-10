import { Component, createElement } from "react";
import type { ComponentType, ErrorInfo, ReactNode } from "react";

import { captureException } from "../client.js";
import type { WatchdockCaptureContext } from "../types.js";

export interface WatchdockErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  contextBuilder?: (error: Error, info: ErrorInfo) => WatchdockCaptureContext | undefined;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface WatchdockErrorBoundaryState {
  error: Error | null;
}

export class WatchdockErrorBoundary extends Component<WatchdockErrorBoundaryProps, WatchdockErrorBoundaryState> {
  state: WatchdockErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WatchdockErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      title: "Unhandled React render error",
      extras: { componentStack: info.componentStack },
      ...(this.props.contextBuilder?.(error, info) ?? {}),
    });
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(error, this.reset);
    }

    return this.props.fallback ?? null;
  }
}

export function withWatchdockErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  boundaryProps?: Omit<WatchdockErrorBoundaryProps, "children">,
): ComponentType<P> {
  function Wrapped(props: P) {
    return createElement(WatchdockErrorBoundary, {
      ...boundaryProps,
      children: createElement(WrappedComponent, props),
    });
  }

  Wrapped.displayName = `withWatchdockErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;
  return Wrapped;
}
