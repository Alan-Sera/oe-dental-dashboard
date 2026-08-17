"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderDown, Loader2, UploadCloud } from "lucide-react";

import { categoryLabels, paymentMethods } from "@/constants";
import {
  attachmentCategoryValues,
  classifyImportCandidate,
  type AttachmentCategoryValue
} from "@/lib/import-classifier";
import type { ImportPreviewFile } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type BatchResponse = {
  batch: {
    id: string;
  };
};

export function ImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<ImportPreviewFile[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fileInputRef.current?.setAttribute("webkitdirectory", "");
    fileInputRef.current?.setAttribute("directory", "");
  }, []);

  const sourceRootName = useMemo(() => {
    const firstPath = files[0]?.relativePath;
    return firstPath?.split("/").filter(Boolean)[0] ?? "Importación local";
  }, [files]);

  async function handleSelection(fileList: FileList | null) {
    if (!fileList?.length) return;

    setError("");
    setStatus("Analizando archivos...");
    setProgress(0);

    const selectedFiles = Array.from(fileList);
    const previewFiles: ImportPreviewFile[] = [];

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const relativePath = normalizeBrowserPath(file);
      const sha256 = await hashFile(file);
      const classified = classifyImportCandidate({
        relativePath,
        fileName: file.name,
        mimeType: file.type
      });

      previewFiles.push({
        id: `${index}-${sha256.slice(0, 12)}`,
        file,
        relativePath: classified.relativePath,
        patientName: classified.patientName,
        category: classified.category,
        sha256,
        sizeBytes: file.size,
        mimeType: file.type,
        duplicateInBatch: false,
        paymentMethod: "Efectivo",
        paymentDate: new Date().toISOString().slice(0, 10)
      });

      setProgress(Math.round(((index + 1) / selectedFiles.length) * 100));
    }

    const counts = previewFiles.reduce<Record<string, number>>((acc, item) => {
      acc[item.sha256] = (acc[item.sha256] ?? 0) + 1;
      return acc;
    }, {});

    setFiles(
      previewFiles.map((item) => ({
        ...item,
        duplicateInBatch: counts[item.sha256] > 1
      }))
    );
    setStatus("Listo para revisar");
  }

  function updateFile(id: string, patch: Partial<ImportPreviewFile>) {
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  }

  function runImport() {
    if (!files.length) return;

    startTransition(async () => {
      try {
        setError("");
        setStatus("Creando lote...");
        setProgress(0);

        const batchResponse = await fetch("/api/import/batches", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sourceRootName,
            items: files.map((file) => ({
              candidateId: file.id,
              patientName: file.patientName,
              category: file.category,
              originalName: file.file.name,
              sourceRelativePath: file.relativePath,
              sha256: file.sha256,
              sizeBytes: file.sizeBytes,
              mimeType: file.mimeType,
              paymentAmount: file.paymentAmount ?? "",
              paymentMethod: file.paymentMethod ?? "",
              paymentDate: file.paymentDate ?? ""
            }))
          })
        });

        if (!batchResponse.ok) throw new Error("No se pudo crear el lote");
        const { batch } = (await batchResponse.json()) as BatchResponse;

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const formData = new FormData();
          formData.append("file", file.file);
          formData.append("candidateId", file.id);
          formData.append("patientName", file.patientName);
          formData.append("category", file.category);
          formData.append("originalName", file.file.name);
          formData.append("sourceRelativePath", file.relativePath);
          formData.append("sha256", file.sha256);
          formData.append("sizeBytes", String(file.sizeBytes));
          formData.append("mimeType", file.mimeType);
          formData.append("paymentAmount", file.paymentAmount ?? "");
          formData.append("paymentMethod", file.paymentMethod ?? "");
          formData.append("paymentDate", file.paymentDate ?? "");

          setStatus(`Copiando ${index + 1} de ${files.length}`);

          const uploadResponse = await fetch(`/api/import/batches/${batch.id}/files`, {
            method: "POST",
            body: formData
          });

          if (!uploadResponse.ok) throw new Error(`Falló ${file.file.name}`);
          setProgress(Math.round(((index + 1) / files.length) * 100));
        }

        const commitResponse = await fetch(`/api/import/batches/${batch.id}/commit`, {
          method: "POST"
        });

        if (!commitResponse.ok) throw new Error("No se pudo confirmar el lote");

        setStatus("Importación confirmada");
        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Error de importación");
        setStatus("");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-lavender-800/80 text-lavender-100 ring-1 ring-lavender-300/35">
            <FolderDown className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="section-title">Importar carpetas por paciente</h2>
            <p className="muted">{files.length ? `${files.length} archivo(s) en revisión` : "Sin lote cargado"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleSelection(event.target.files)}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="size-4" aria-hidden="true" />
            Seleccionar carpeta
          </Button>
          <Button type="button" onClick={runImport} disabled={!files.length || isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
            Confirmar importación
          </Button>
        </div>
      </div>

      {status || error ? (
        <div className="surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className={error ? "text-sm text-coral-400" : "text-sm text-ink-300"}>{error || status}</p>
            <p className="text-sm text-lavender-200/55">{progress}%</p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-lavender-900/75">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-lavender-300 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {files.length ? (
        <div className="panel overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.2fr_1fr_180px_260px] gap-3 border-b border-lavender-600/45 bg-lavender-950/25 px-4 py-3 text-xs font-medium uppercase text-lavender-200/65">
              <span>Archivo</span>
              <span>Paciente</span>
              <span>Tipo</span>
              <span>Pago</span>
            </div>
            <div className="max-h-[62vh] overflow-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="grid grid-cols-[1.2fr_1fr_180px_260px] gap-3 border-b border-lavender-600/45 px-4 py-3 transition last:border-0 hover:bg-lavender-800/25"
                >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-100">{file.file.name}</p>
                  <p className="truncate text-xs text-lavender-200/50">{file.relativePath}</p>
                  {file.duplicateInBatch ? <Badge tone="amber" className="mt-2">Duplicado en lote</Badge> : null}
                </div>
                <Input
                  value={file.patientName}
                  onChange={(event) => updateFile(file.id, { patientName: event.target.value })}
                />
                <Select
                  value={file.category}
                  onChange={(event) =>
                    updateFile(file.id, { category: event.target.value as AttachmentCategoryValue })
                  }
                >
                  {attachmentCategoryValues.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </Select>
                {file.category === "PAYMENT_RECEIPT" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Monto"
                      inputMode="decimal"
                      value={file.paymentAmount ?? ""}
                      onChange={(event) => updateFile(file.id, { paymentAmount: event.target.value })}
                    />
                    <Select
                      value={file.paymentMethod ?? "Efectivo"}
                      onChange={(event) => updateFile(file.id, { paymentMethod: event.target.value })}
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="date"
                      value={file.paymentDate ?? ""}
                      onChange={(event) => updateFile(file.id, { paymentDate: event.target.value })}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-lavender-200/55">Sin captura</p>
                )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function hashFile(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeBrowserPath(file: File) {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return (path || file.name).replace(/\\/g, "/");
}
