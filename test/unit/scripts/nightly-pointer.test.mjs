import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  NIGHTLY_POINTER_INTERVAL_MS,
  NIGHTLY_POINTER_READS,
  waitForNightlyPointer
} from "../../../scripts/release/channels.mjs";

const expected = { version: "1.4.1", artifact: { sha256: "a".repeat(64) } };

it("waits for an older valid pointer to advance to the exact candidate", async () => {
  const readManifest = vi
    .fn()
    .mockResolvedValueOnce({ ...expected, version: "1.4.0" })
    .mockResolvedValueOnce(expected);
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).resolves.toBe(2);
  expect(readManifest).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(5_000);
});

it.each([
  { ...expected, version: "1.4.2" },
  { ...expected, artifact: { sha256: "b".repeat(64) } }
])("rejects a newer or changed candidate without retrying", async (published) => {
  const readManifest = vi.fn().mockResolvedValue(published);
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "verification failed"
  );
  expect(readManifest).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("does not retry signature or download verification failures", async () => {
  const readManifest = vi.fn().mockRejectedValue(new Error("Invalid signature"));
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "Invalid signature"
  );
  expect(readManifest).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("fails after bounded retries when the old pointer persists", async () => {
  const readManifest = vi.fn().mockResolvedValue({ ...expected, version: "1.4.0" });
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "did not advance"
  );
  expect(readManifest).toHaveBeenCalledTimes(61);
  expect(sleep).toHaveBeenCalledTimes(60);
});

it("waits five minutes inside the publish job time limit", () => {
  const waitMs = (NIGHTLY_POINTER_READS - 1) * NIGHTLY_POINTER_INTERVAL_MS;
  expect(waitMs).toBe(5 * 60_000);
  const workflow = readFileSync(
    new URL("../../../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));
  const timeoutMinutes = Number(publishJob.match(/timeout-minutes: (\d+)/)?.[1]);
  expect(timeoutMinutes * 60_000).toBeGreaterThanOrEqual(waitMs * 2);
});
