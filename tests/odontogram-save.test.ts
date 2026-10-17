import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  queryPatientOdontogramData: vi.fn(),
  revalidatePath: vi.fn(),
  patientFindUnique: vi.fn(),
  odontogramUpsert: vi.fn(),
  odontogramUpdateMany: vi.fn(),
  odontogramFindUnique: vi.fn(),
  recordFindMany: vi.fn(),
  recordCreate: vi.fn(),
  recordUpdate: vi.fn(),
  recordUpdateMany: vi.fn(),
  versionCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("@/lib/odontogram-data", () => ({
  queryPatientOdontogramData: mocks.queryPatientOdontogramData,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { savePatientOdontogram } from "@/lib/actions/odontogram.actions";

const patientId = "patient-1";
const recordCreatedAt = new Date("2026-06-01T12:00:00.000Z");
const changedAt = new Date("2026-10-16T12:00:00.000Z");

function storedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    odontogramId: "chart-1",
    tooth: "11",
    treatment: "resin",
    phase: "current",
    status: "pending",
    notes: "Nota original",
    createdAt: recordCreatedAt,
    retiredAt: null,
    surfaces: [{ surface: "M" }],
    ...overrides,
  };
}

function recordVersion(changeType: "updated" | "retired") {
  return {
    id: "version-1",
    recordId: "record-1",
    tooth: "11",
    treatment: "resin",
    phase: "current",
    status: "pending",
    notes: "Nota original",
    recordCreatedAt,
    changeType,
    changedAt,
    surfaces: [{ surface: "M" }],
  };
}

function transactionClient() {
  return {
    patient: { findUnique: mocks.patientFindUnique },
    odontogram: {
      upsert: mocks.odontogramUpsert,
      updateMany: mocks.odontogramUpdateMany,
      findUnique: mocks.odontogramFindUnique,
    },
    odontogramRecord: {
      findMany: mocks.recordFindMany,
      create: mocks.recordCreate,
      update: mocks.recordUpdate,
      updateMany: mocks.recordUpdateMany,
    },
    odontogramRecordVersion: { create: mocks.versionCreate },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.patientFindUnique.mockResolvedValue({ id: patientId });
  mocks.odontogramUpsert.mockResolvedValue({ id: "chart-1" });
  mocks.odontogramUpdateMany.mockResolvedValue({ count: 1 });
  mocks.recordFindMany.mockResolvedValue([]);
  mocks.recordCreate.mockResolvedValue(undefined);
  mocks.recordUpdate.mockResolvedValue(undefined);
  mocks.recordUpdateMany.mockResolvedValue({ count: 0 });
  mocks.versionCreate.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient()),
  );
});

describe("guardado versionado del odontograma", () => {
  it("guarda una versión anterior antes de actualizar un registro existente", async () => {
    const original = storedRecord();
    const priorVersion = recordVersion("updated");
    mocks.recordFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([original]);
    mocks.odontogramFindUnique.mockResolvedValue({
      revision: 8,
      records: [{ ...original, notes: "Nota corregida", versions: [priorVersion] }],
    });

    const result = await savePatientOdontogram(patientId, [{
      id: "record-1",
      tooth: "11",
      treatment: "resin",
      phase: "current",
      status: "pending",
      notes: "Nota corregida",
      createdAt: recordCreatedAt.toISOString(),
      surfaces: ["M"],
    }], 7);

    expect(result).toMatchObject({
      success: true,
      data: {
        revision: 8,
        records: [{ id: "record-1", notes: "Nota corregida" }],
        history: [{ id: "version-1", changeType: "updated", notes: "Nota original" }],
      },
    });
    expect(mocks.odontogramUpdateMany).toHaveBeenCalledWith({
      where: { id: "chart-1", revision: 7 },
      data: { revision: { increment: 1 } },
    });
    expect(mocks.versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: "record-1",
        notes: "Nota original",
        changeType: "updated",
        surfaces: { create: [{ surface: "M" }] },
      }),
    });
    expect(mocks.recordUpdate).toHaveBeenCalledOnce();
  });

  it("conserva como versión histórica el registro retirado sin devolverlo entre los activos", async () => {
    const original = storedRecord();
    mocks.recordFindMany.mockResolvedValueOnce([original]);
    mocks.odontogramFindUnique.mockResolvedValue({
      revision: 3,
      records: [{ ...original, retiredAt: changedAt, versions: [recordVersion("retired")] }],
    });

    const result = await savePatientOdontogram(patientId, [], 2);

    expect(result).toMatchObject({
      success: true,
      data: {
        revision: 3,
        records: [],
        history: [{ id: "version-1", changeType: "retired", recordId: "record-1" }],
      },
    });
    expect(mocks.versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ recordId: "record-1", changeType: "retired" }),
    });
    expect(mocks.recordUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["record-1"] }, retiredAt: null }),
      data: { retiredAt: expect.any(Date) },
    }));
  });

  it("rechaza una revisión vieja, devuelve la versión guardada y no escribe registros", async () => {
    const latest = { revision: 5, records: [], history: [] };
    mocks.odontogramUpdateMany.mockResolvedValue({ count: 0 });
    mocks.queryPatientOdontogramData.mockResolvedValue(latest);

    const result = await savePatientOdontogram(patientId, [], 4);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("cambió desde que lo abriste"),
      latest,
    });
    expect(mocks.recordFindMany).not.toHaveBeenCalled();
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.queryPatientOdontogramData).toHaveBeenCalledWith(patientId);
  });

  it("no permite guardar sin una sesión autenticada", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const result = await savePatientOdontogram(patientId, [], 0);

    expect(result).toMatchObject({ success: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
