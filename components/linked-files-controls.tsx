import { AlertTriangle } from "lucide-react";

import {
  updatePatientLocalFolderPath,
  type LinkedFilesReport
} from "@/lib/actions/settings.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LinkedFilesControls({ report }: { report: LinkedFilesReport }) {
  const hasMissing = report.missingCount > 0;

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">Carpeta maestra</p>
          <p className="truncate text-sm text-lavender-200/60">
            {report.patientsRootPath || "Sin configurar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={hasMissing ? "coral" : report.checked ? "mint" : "neutral"}>
            {hasMissing
              ? `${report.missingCount} faltante(s)`
              : report.checked
                ? "Rutas completas"
                : "Sin revisión"}
          </Badge>
          {/* <Button asChild variant="secondary" size="sm">
            <Link href="/settings">
              <FolderSearch className="size-4" aria-hidden="true" />
              Revisar
            </Link>
          </Button> */}
        </div>
      </div>

      <p className="text-sm text-lavender-200/60">
        Los backups guardan la base de datos y la configuración. Las fotos, radiografías y documentos
        permanecen solo en su carpeta original.
      </p>

      {report.error ? (
        <div className="surface flex gap-3 p-4 text-sm text-coral-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{report.error}</p>
        </div>
      ) : null}

      {report.checked && !report.error && !hasMissing ? (
        <div className="surface p-4 text-sm text-lavender-200/60">
          {report.patientCount} expediente(s) revisado(s), sin faltantes detectados.
        </div>
      ) : null}

      {report.groups?.map((group) => (
        <div key={group.patientId} className="surface space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink-100">{group.fullName}</p>
              <p className="truncate text-sm text-lavender-200/55">
                {group.localFolderRelativePath ?? "Sin carpeta vinculada"}
              </p>
            </div>
            <Badge tone="coral">{group.missingAttachments.length} faltante(s)</Badge>
          </div>

          <form action={updatePatientLocalFolderPath} className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="patientId" value={group.patientId} />
            <Input
              name="localFolderRelativePath"
              defaultValue={group.localFolderRelativePath ?? ""}
              placeholder="Carpeta relativa dentro de la carpeta maestra"
            />
            <Button type="submit" variant="secondary">
              Actualizar ruta
            </Button>
          </form>

          <div className="space-y-2">
            {group.missingAttachments.slice(0, 6).map((attachment) => (
              <div key={attachment.id} className="rounded-md border border-lavender-600/45 px-3 py-2">
                <p className="text-sm font-medium text-ink-100">{attachment.originalName}</p>
                <p className="truncate text-xs text-lavender-200/50">{attachment.sourceRelativePath}</p>
              </div>
            ))}
            {group.missingAttachments.length > 6 ? (
              <p className="text-sm text-lavender-200/55">
                {group.missingAttachments.length - 6} faltante(s) más
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
