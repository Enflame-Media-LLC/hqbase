import worker from "@worker/index";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

function workerWithAppPage() {
  const assets = vi.fn(
    async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } })
  );
  const env = { ASSETS: { fetch: assets } } as unknown as WorkerEnv;
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  return {
    assets,
    fetch: (path: string) => worker.fetch(new Request(`https://mail.example.test${path}`), env, ctx)
  };
}

describe("missing static files", () => {
  it.each([
    "/assets/settings-page-missing.js",
    "/assets/app-missing.css",
    "/fonts/Inter-Missing.woff2",
    "/icons/missing.png",
    "/sounds/missing.wav"
  ])("returns an uncached 404 instead of the app page for %s", async (path) => {
    const app = workerWithAppPage();
    const response = await app.fetch(path);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(app.assets).not.toHaveBeenCalled();
  });

  it("keeps the app page for client routes", async () => {
    const app = workerWithAppPage();
    const response = await app.fetch("/settings/updates");

    expect(response.status).toBe(200);
    expect(app.assets).toHaveBeenCalledOnce();
  });
});
