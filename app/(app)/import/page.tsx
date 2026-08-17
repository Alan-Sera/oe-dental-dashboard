import { ImportWizard } from "@/components/import-wizard";
import { getRecentImportBatches } from "@/lib/actions/import.actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const batches = await getRecentImportBatches();

  return (
    <main className="page-shell">
      <div>
        <h1 className="text-2xl font-semibold text-white">Importar</h1>
        <p className="muted">Carpetas locales copiadas a la bóveda</p>
      </div>

      <ImportWizard />

      <Card>
        <h2 className="section-title mb-4">Lotes</h2>
        <div className="surface overflow-hidden">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="grid gap-3 border-b border-lavender-600/45 px-4 py-3 transition last:border-0 hover:bg-lavender-800/30 md:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="font-medium text-white">{batch.sourceRootName}</p>
                <p className="text-sm text-lavender-200/55">
                  {batch.importedCount} importado(s) · {batch.duplicateCount} duplicado(s) · {batch.errorCount} error(es)
                </p>
              </div>
              <p className="text-sm text-lavender-200/55">{formatDate(batch.createdAt)}</p>
              <Badge tone={batch.status === "COMMITTED" ? "mint" : batch.status === "FAILED" ? "coral" : "amber"}>
                {batch.status}
              </Badge>
            </div>
          ))}
          {batches.length === 0 ? <p className="px-4 py-8 text-sm text-lavender-200/55">Sin lotes importados</p> : null}
        </div>
      </Card>
    </main>
  );
}
