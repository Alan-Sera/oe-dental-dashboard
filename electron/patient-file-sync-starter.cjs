const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

function createPatientFileSyncStarter({ request, onRetry, onStarted }) {
  let stopped = false;
  let started = false;
  let inFlight = false;
  let retryTimer = null;
  let controller = null;
  let retryDelayMs = INITIAL_RETRY_MS;

  async function attempt() {
    if (stopped || started || inFlight) return;

    inFlight = true;
    controller = new AbortController();
    try {
      await request(controller.signal);
      if (!stopped) {
        started = true;
        onStarted?.();
      }
    } catch (error) {
      if (!stopped) {
        const delayMs = retryDelayMs;
        retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
        onRetry?.(error, delayMs);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void attempt();
        }, delayMs);
        retryTimer.unref?.();
      }
    } finally {
      controller = null;
      inFlight = false;
    }
  }

  return {
    start() {
      if (!retryTimer) void attempt();
    },
    stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      controller?.abort();
    },
  };
}

module.exports = { createPatientFileSyncStarter };
