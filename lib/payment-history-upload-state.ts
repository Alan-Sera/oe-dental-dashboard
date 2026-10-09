export const PAYMENT_HISTORY_UPLOAD_LEASE_MS = 5 * 60 * 1000;

export function isPaymentHistoryUploadInProgress(
  uploadStartedAt: string | Date | null | undefined,
  now = Date.now()
) {
  if (!uploadStartedAt) return false;
  const startedAt = typeof uploadStartedAt === "string"
    ? Date.parse(uploadStartedAt)
    : uploadStartedAt.getTime();

  return Number.isFinite(startedAt) && now - startedAt < PAYMENT_HISTORY_UPLOAD_LEASE_MS;
}
