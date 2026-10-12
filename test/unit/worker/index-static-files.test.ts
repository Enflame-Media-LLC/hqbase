import worker from "@worker/index";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

const appPage = () =>
  new Response("<!doctype html>", {
    headers: { "cache-control": "public, max-age=31536000, immutable", "content-type": "text/html" }
  });

function workerWithAssets(files: Record<string, () => Response>) {
  const assets = vi.fn(async (request: Request) => {
    const file = files[new URL(request.url).pathname];
    return file ? file() : appPage();
  });
  const env = { ASSETS: { fetch: assets } } as unknown as WorkerEnv;
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  return {
    assets,
    fetch: (path: string) => worker.fetch(new Request(`https://mail.example.test${path}`), env, ctx)
  };
}

describe("static files", () => {
  it.each([
    "/assets/settings-page-missing.js",
    "/assets/app-missing.css",
    "/fonts/Inter-Missing.woff2",
    "/icons/missing.png",
    "/sounds/missing.wav"
  ])("returns an uncached 404 instead of the app page for %s", async (path) => {
    const app = workerWithAssets({});
    const response = await app.fetch(path);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).not.toContain("text/html");
  });

  it("returns a hashed file with its body and a one-year immutable cache", async () => {
    const app = workerWithAssets({
      "/assets/app-abc.js": () =>
        new Response("export {};", {
          headers: { "cache-control": "public, max-age=0", "content-type": "text/javascript" }
        })
    });
    const response = await app.fetch("/assets/app-abc.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe("export {};");
  });

  it("keeps the immutable cache on a revalidated hashed file", async () => {
    const app = workerWithAssets({
      "/assets/app-abc.js": () => new Response(null, { status: 304 })
    });
    const response = await app.fetch("/assets/app-abc.js");

    expect(response.status).toBe(304);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("returns other static files unchanged", async () => {
    const font = new Response("font", {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "font/woff2"
      }
    });
    const app = workerWithAssets({ "/fonts/Inter.woff2": () => font });

    await expect(app.fetch("/fonts/Inter.woff2")).resolves.toBe(font);
  });

  it("keeps the app page for client routes", async () => {
    const app = workerWithAssets({});
    const response = await app.fetch("/settings/updates");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(app.assets).toHaveBeenCalledOnce();
  });
});
