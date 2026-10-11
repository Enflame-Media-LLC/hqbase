import * as React from "react";
import { Button } from "@/components/ui/button";

const reloadStorageKey = "hqbase:load-failure-reload";
const reloadWindowMs = 60_000;

export class LoadFailure extends Error {
  constructor(cause: unknown) {
    super("A part of HQBase could not load.", { cause });
    this.name = "LoadFailure";
  }
}

export const lazyComponent: typeof React.lazy = (load) =>
  React.lazy(() =>
    load().catch((error: unknown) => {
      throw new LoadFailure(error);
    })
  );

type LoadBoundaryProps = {
  children: React.ReactNode;
  message: string;
  resetKey?: string;
  variant: "notice" | "page";
};

type LoadBoundaryState = {
  failure: "reload" | "show" | null;
};

export class LoadBoundary extends React.Component<LoadBoundaryProps, LoadBoundaryState> {
  override state: LoadBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): LoadBoundaryState {
    return { failure: error instanceof LoadFailure && mayReload(Date.now()) ? "reload" : "show" };
  }

  override componentDidCatch(): void {
    if (this.state.failure !== "reload") return;
    // A new release can remove the files of the running page. One reload gets the current files.
    if (recordReload(Date.now())) window.location.reload();
    else this.setState({ failure: "show" });
  }

  override componentDidUpdate(previous: LoadBoundaryProps): void {
    if (this.state.failure !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ failure: null });
    }
  }

  override render(): React.ReactNode {
    if (this.state.failure === null) return this.props.children;
    if (this.state.failure === "reload") return null;
    const reload = (
      <Button
        className="shrink-0 rounded-lg px-3.5"
        onClick={() => window.location.reload()}
        size="sm"
        type="button"
      >
        Reload
      </Button>
    );
    return this.props.variant === "page" ? (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
        role="alert"
      >
        <p>{this.props.message}</p>
        {reload}
      </div>
    ) : (
      <aside
        className="fixed right-4 bottom-4 left-4 z-[100] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm text-popover-foreground shadow-[0_14px_38px_rgb(0_0_0/0.32)]"
        role="alert"
      >
        <span className="text-xs font-semibold">{this.props.message}</span>
        {reload}
      </aside>
    );
  }
}

function mayReload(now: number): boolean {
  try {
    const previous = Number(window.sessionStorage.getItem(reloadStorageKey));
    return !(previous > 0 && now - previous < reloadWindowMs);
  } catch {
    return false;
  }
}

function recordReload(now: number): boolean {
  try {
    window.sessionStorage.setItem(reloadStorageKey, String(now));
    return true;
  } catch {
    return false;
  }
}
