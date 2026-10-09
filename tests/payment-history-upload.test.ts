import { beforeEach, describe, expect, it, vi } from "vitest";

const { driveMocks, prismaMocks } = vi.hoisted(() => ({
  driveMocks: {
    findGoogleDriveResource: vi.fn(),
    isGoogleReconnectRequiredError: vi.fn(() => false),
    isMissingGoogleDriveResource: vi.fn(() => false),
    uploadXlsxAsGoogleSheet: vi.fn(),
    verifyGoogleDriveFile: vi.fn()
  },
  prismaMocks: {
    findUnique: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google-drive", () => driveMocks);
vi.mock("@/lib/prisma", () => ({
  prisma: { paymentHistorySheet: prismaMocks }
}));

import {
  ensurePaymentHistorySheetUploaded,
  PaymentHistoryUploadAlreadyRunningError
} from "@/lib/services/payment-history-upload";

const input = {
  sheetId: "history-id",
  patientId: "patient-id",
  accessToken: "access-token",
  targetFolderId: "target-folder",
  fileName: "payment-history.xlsx",
  loadFileBuffer: async () => Buffer.from("xlsx")
};

function setupAtomicUploadClaim(initialLease: Date | null = null) {
  let lease = initialLease;
  prismaMocks.updateMany.mockImplementation(async ({ where, data }) => {
    const expectedLease = where.uploadStartedAt as Date | undefined;
    if (expectedLease) {
      if (lease?.getTime() !== expectedLease.getTime()) return { count: 0 };
      lease = data.uploadStartedAt ?? null;
      return { count: 1 };
    }

    const staleBefore = where.OR[1].uploadStartedAt.lte as Date;
    if (lease && lease.getTime() >= staleBefore.getTime()) return { count: 0 };
    lease = data.uploadStartedAt;
    return { count: 1 };
  });
}

describe("ensurePaymentHistorySheetUploaded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.findUnique.mockResolvedValue({
      id: input.sheetId,
      patientId: input.patientId,
      googleFileId: null,
      googleFolderId: null
    });
    setupAtomicUploadClaim();
    driveMocks.findGoogleDriveResource.mockResolvedValue(null);
    driveMocks.uploadXlsxAsGoogleSheet.mockResolvedValue({
      id: "new-sheet-id",
      webViewLink: "https://drive.google.com/file/d/new-sheet-id"
    });
    driveMocks.verifyGoogleDriveFile.mockResolvedValue({
      id: "existing-sheet-id",
      mimeType: "application/vnd.google-apps.spreadsheet",
      webViewLink: "https://drive.google.com/file/d/existing-sheet-id",
      parents: [input.targetFolderId]
    });
  });

  it("reuses the saved sheet when retrying to the same folder", async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: input.sheetId,
      patientId: input.patientId,
      googleFileId: "existing-sheet-id",
      googleFolderId: input.targetFolderId
    });

    const result = await ensurePaymentHistorySheetUploaded(input);

    expect(result.id).toBe("existing-sheet-id");
    expect(driveMocks.verifyGoogleDriveFile).toHaveBeenCalledWith(input.accessToken, "existing-sheet-id");
    expect(driveMocks.findGoogleDriveResource).not.toHaveBeenCalled();
    expect(driveMocks.uploadXlsxAsGoogleSheet).not.toHaveBeenCalled();
  });

  it("adopts a Drive sheet created before an interrupted local save", async () => {
    driveMocks.findGoogleDriveResource.mockResolvedValue({
      id: "orphaned-sheet-id",
      mimeType: "application/vnd.google-apps.spreadsheet",
      webViewLink: "https://drive.google.com/file/d/orphaned-sheet-id"
    });

    const result = await ensurePaymentHistorySheetUploaded(input);

    expect(result.id).toBe("orphaned-sheet-id");
    expect(driveMocks.findGoogleDriveResource).toHaveBeenCalledWith(expect.objectContaining({
      paymentHistorySheetId: input.sheetId,
      parentId: input.targetFolderId
    }));
    expect(driveMocks.uploadXlsxAsGoogleSheet).not.toHaveBeenCalled();
  });

  it("uploads to a changed folder and updates only the saved pointer", async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: input.sheetId,
      patientId: input.patientId,
      googleFileId: "old-sheet-id",
      googleFolderId: "old-folder"
    });

    const result = await ensurePaymentHistorySheetUploaded(input);

    expect(driveMocks.verifyGoogleDriveFile).not.toHaveBeenCalled();
    expect(driveMocks.uploadXlsxAsGoogleSheet).toHaveBeenCalledWith(expect.objectContaining({
      folderId: input.targetFolderId,
      appProperties: expect.objectContaining({ oePaymentHistorySheetId: input.sheetId })
    }));
    expect(prismaMocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        googleFileId: "new-sheet-id",
        googleFolderId: input.targetFolderId
      })
    }));
    expect(result.id).toBe("new-sheet-id");
  });

  it("allows reclaiming an upload claim abandoned for more than five minutes", async () => {
    const abandonedAt = new Date(Date.now() - 6 * 60 * 1000);
    setupAtomicUploadClaim(abandonedAt);

    const result = await ensurePaymentHistorySheetUploaded(input);

    expect(result.id).toBe("new-sheet-id");
    expect(driveMocks.uploadXlsxAsGoogleSheet).toHaveBeenCalledTimes(1);
  });

  it("clears the claim and records failure when the upload fails", async () => {
    driveMocks.uploadXlsxAsGoogleSheet.mockRejectedValue(new Error("Drive no disponible"));

    await expect(ensurePaymentHistorySheetUploaded(input)).rejects.toThrow("Drive no disponible");

    expect(prismaMocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        uploadStatus: "FAILED",
        uploadStartedAt: null,
        errorMessage: "Drive no disponible"
      })
    }));
  });

  it("allows only one simultaneous upload for the same payment history", async () => {
    let resolveUpload!: (value: { id: string; webViewLink: string }) => void;
    driveMocks.uploadXlsxAsGoogleSheet.mockImplementation(() => new Promise((resolve) => {
      resolveUpload = resolve;
    }));

    const firstAttempt = ensurePaymentHistorySheetUploaded(input);
    await vi.waitFor(() => expect(driveMocks.uploadXlsxAsGoogleSheet).toHaveBeenCalledTimes(1));
    await expect(ensurePaymentHistorySheetUploaded(input)).rejects.toBeInstanceOf(
      PaymentHistoryUploadAlreadyRunningError
    );

    resolveUpload({ id: "new-sheet-id", webViewLink: "https://drive.google.com/file/d/new-sheet-id" });
    await expect(firstAttempt).resolves.toMatchObject({ id: "new-sheet-id" });
    expect(driveMocks.uploadXlsxAsGoogleSheet).toHaveBeenCalledTimes(1);
  });
});
