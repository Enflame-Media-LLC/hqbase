import { describe, expect, it, vi } from "vitest";

import { renderServiceWorker } from "../../../scripts/build-pwa.mjs";

const precacheUrls = ["/assets/app-abc.js", "/fonts/Inter.woff2", "/offline.html"];
const types = {
  "/assets/app-abc.js": "text/javascript",
  "/fonts/Inter.woff2": "font/woff2",
  "/offline.html": "text/html; charset=utf-8"
};

function response(body, contentType, { redirected = false, status = 200 } = {}) {
  const result = new Response(body, { headers: { "content-type": contentType }, status });
  if (redirected) Object.defineProperty(result, "redirected", { value: true });
  return result;
}

function installWorker(serve) {
  const handlers = {};
  const stored = new Map();
  const caches = {
    open: vi.fn(async () => ({
      put: async (url, value) => {
        stored.set(url, value);
      }
    }))
  };
  const fetch = vi.fn(async (url) => serve(url));
  const self = { addEventListener: (type, handler) => (handlers[type] = handler) };
  const source = renderServiceWorker({ cacheName: "hqbase-pwa-test-2", precacheUrls });
  new Function("self", "caches", "fetch", source)(self, caches, fetch);

  let installation;
  handlers.install({ waitUntil: (promise) => (installation = promise) });
  return { caches, fetch, installation, stored };
}

describe("service worker precache", () => {
  it("reads every file from the network and stores it only after all files pass", async () => {
    const worker = installWorker((url) => response(`body of ${url}`, types[url]));

    await worker.installation;

    for (const url of precacheUrls) {
      expect(worker.fetch).toHaveBeenCalledWith(url, { cache: "reload" });
      expect(await worker.stored.get(url).text()).toBe(`body of ${url}`);
    }
  });

  it.each([
    ["the app page for a script", "/assets/app-abc.js", () => response("<html>", "text/html")],
    ["a failed response", "/fonts/Inter.woff2", () => response("", "text/plain", { status: 404 })],
    ["an offline page that is not HTML", "/offline.html", () => response("{}", "text/plain")]
  ])("does not install after %s", async (_name, failingUrl, failure) => {
    const worker = installWorker((url) =>
      url === failingUrl ? failure() : response("ok", types[url])
    );

    await expect(worker.installation).rejects.toThrow("unexpected response");
    expect(worker.caches.open).not.toHaveBeenCalled();
    expect(worker.stored.size).toBe(0);
  });

  it("stores a redirected offline page as its final response", async () => {
    const worker = installWorker((url) =>
      response(`body of ${url}`, types[url], { redirected: url === "/offline.html" })
    );

    await worker.installation;

    const offline = worker.stored.get("/offline.html");
    expect(offline.redirected).toBe(false);
    expect(offline.status).toBe(200);
    expect(offline.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await offline.text()).toBe("body of /offline.html");
  });
});
