import { describe, expect, it } from "vitest";

import {
  classifyImportCandidate,
  extractPatientName
} from "@/lib/import-classifier";

describe("import classifier", () => {
  it("extracts patient names from top-level folders", () => {
    expect(extractPatientName("001_MARIA-LOPEZ/fotos/frontal.jpg")).toBe("Maria Lopez");
  });

  it("classifies dental radiographs", () => {
    expect(
      classifyImportCandidate({
        relativePath: "Juan Perez/radiografias/panoramica.png",
        fileName: "panoramica.png",
        mimeType: "image/png"
      }).category
    ).toBe("RADIOGRAPH");
  });

  it("classifies payment receipts before generic images", () => {
    expect(
      classifyImportCandidate({
        relativePath: "Ana Ruiz/pagos/recibo-enero.jpg",
        fileName: "recibo-enero.jpg",
        mimeType: "image/jpeg"
      }).category
    ).toBe("PAYMENT_RECEIPT");
  });

  it("classifies payment history spreadsheets", () => {
    expect(
      classifyImportCandidate({
        relativePath: "Ana Ruiz/historial pagos/estado-cuenta.xlsx",
        fileName: "estado-cuenta.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }).category
    ).toBe("PAYMENT_HISTORY");
  });

  it("does not classify generic photos or receipts as payment history", () => {
    expect(
      classifyImportCandidate({
        relativePath: "Ana Ruiz/fotos/sonrisa.jpg",
        fileName: "sonrisa.jpg",
        mimeType: "image/jpeg"
      }).category
    ).toBe("PHOTO");

    expect(
      classifyImportCandidate({
        relativePath: "Ana Ruiz/pagos/recibo-transferencia.pdf",
        fileName: "recibo-transferencia.pdf",
        mimeType: "application/pdf"
      }).category
    ).toBe("PAYMENT_RECEIPT");
  });

  it("classifies clinical history documents", () => {
    expect(
      classifyImportCandidate({
        relativePath: "Ana Ruiz/historia clinica/expediente.pdf",
        fileName: "expediente.pdf",
        mimeType: "application/pdf"
      }).category
    ).toBe("CLINICAL_HISTORY");
  });
});
