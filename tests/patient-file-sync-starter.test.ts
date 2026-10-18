import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPatientFileSyncStarter } = require("../electron/patient-file-sync-starter.cjs") as {
  createPatientFileSyncStarter: (options: {
    request: (signal: AbortSignal) => Promise<void>;
    onRetry?: (error: unknown, delayMs: number) => void;
    onStarted?: () => void;
  }) => { start: () => void; stop: () => void };
};

describe("Electron patient file sync startup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries failed starts from one to thirty seconds and stops after confirmation", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const onStarted = vi.fn();
    const starter = createPatientFileSyncStarter({ request, onRetry, onStarted });

    starter.start();
    starter.start();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      expect(onRetry.mock.lastCall?.[1]).toBe(delay);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(request).toHaveBeenCalledTimes(onRetry.mock.calls.length);
      await vi.advanceTimersByTimeAsync(1);
    }

    expect(request).toHaveBeenCalledTimes(8);
    expect(onStarted).toHaveBeenCalledTimes(1);
    starter.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(8);
  });

  it("cancels scheduled retries when Electron closes", async () => {
    const request = vi.fn().mockRejectedValue(new Error("unavailable"));
    const starter = createPatientFileSyncStarter({ request });
    starter.start();
    await Promise.resolve();
    starter.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight request without scheduling another one", async () => {
    let signal: AbortSignal | undefined;
    const request = vi.fn((receivedSignal: AbortSignal) => {
      signal = receivedSignal;
      return new Promise<void>((_resolve, reject) => {
        receivedSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const onRetry = vi.fn();
    const starter = createPatientFileSyncStarter({ request, onRetry });
    starter.start();
    starter.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
