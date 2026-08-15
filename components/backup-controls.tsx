"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, HardDriveDownload } from "lucide-react";

import {
  createLocalBackup,
  restoreLocalBackup
} from "@/lib/actions/settings.actions";
import { Button } from "@/components/ui/button";

export function BackupControls({ backups }: { backups: Array<{ name: string; createdAt: string }> }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const name = await createLocalBackup();
            setMessage(`Backup creado: ${name}`);
            router.refresh();
          });
        }}
      >
        <HardDriveDownload className="size-4" aria-hidden="true" />
        Crear backup
      </Button>

      {message ? <p className="text-sm text-mint-500">{message}</p> : null}

      <div className="surface overflow-hidden">
        {backups.map((backup) => (
          <div
            key={backup.name}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3 last:border-0"
          >
            <div>
              <p className="font-medium text-ink-100">{backup.name}</p>
              <p className="text-sm text-ink-500">{new Date(backup.createdAt).toLocaleString("es")}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await restoreLocalBackup(backup.name);
                  setMessage(`Backup restaurado: ${backup.name}`);
                  router.refresh();
                });
              }}
            >
              <ArchiveRestore className="size-4" aria-hidden="true" />
              Restaurar
            </Button>
          </div>
        ))}
        {backups.length === 0 ? <p className="px-4 py-8 text-sm text-ink-500">Sin backups</p> : null}
      </div>
    </div>
  );
}
