// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoadBoundary, lazyComponent } from "@/components/layout/load-boundary";
import { flushHookEffects, renderComponent } from "../render-hook";

const reloadKey = "hqbase:load-failure-reload";

function brokenPage() {
  return lazyComponent<React.ComponentType>(() =>
    Promise.reject(new TypeError("Failed to fetch dynamically imported module"))
  );
}

function ThrowsWhileShowing(): React.ReactElement {
  throw new Error("Render failed");
}

async function show(content: React.ReactNode, resetKey = "settings") {
  const view = await renderComponent(
    <LoadBoundary message="HQBase could not open this page." resetKey={resetKey} variant="page">
      <React.Suspense fallback={<p>Loading</p>}>{content}</React.Suspense>
    </LoadBoundary>
  );
  for (let flush = 0; flush < 4; flush += 1) await flushHookEffects();
  return view;
}

describe("load boundary", () => {
  let reload: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads once when a page cannot load", async () => {
    const Page = brokenPage();
    const view = await show(<Page />);

    expect(reload).toHaveBeenCalledOnce();
    expect(Number(window.sessionStorage.getItem(reloadKey))).toBeGreaterThan(0);
    expect(view.container.textContent).toBe("");
    await view.unmount();
  });

  it("offers Reload when the page fails again within one minute", async () => {
    window.sessionStorage.setItem(reloadKey, String(Date.now() - 30_000));
    const Page = brokenPage();
    const view = await show(<Page />);

    expect(reload).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      "HQBase could not open this page."
    );
    await flushHookEffects(() => view.container.querySelector("button")?.click());
    expect(reload).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("reloads again after the one-minute window", async () => {
    window.sessionStorage.setItem(reloadKey, String(Date.now() - 61_000));
    const Page = brokenPage();
    const view = await show(<Page />);

    expect(reload).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("offers Reload without reloading when a page fails while it shows", async () => {
    const view = await show(<ThrowsWhileShowing />);

    expect(reload).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("HQBase could not open this page.");
    expect(view.container.textContent).toContain("Reload");
    await view.unmount();
  });

  it("shows the next page after the route changes", async () => {
    const view = await show(<ThrowsWhileShowing />);
    await view.rerender(
      <LoadBoundary message="HQBase could not open this page." resetKey="inbox" variant="page">
        <p>Inbox</p>
      </LoadBoundary>
    );

    expect(view.container.textContent).toBe("Inbox");
    await view.unmount();
  });

  it("keeps the rest of the app visible with a compact notice", async () => {
    const view = await renderComponent(
      <main>
        <p>Inbox</p>
        <LoadBoundary message="HQBase could not open the message editor." variant="notice">
          <ThrowsWhileShowing />
        </LoadBoundary>
      </main>
    );

    expect(view.container.textContent).toContain("Inbox");
    const notice = view.container.querySelector("aside[role='alert']");
    expect(notice?.textContent).toContain("HQBase could not open the message editor.");
    expect(notice?.className).toContain("fixed");
    await view.unmount();
  });
});
