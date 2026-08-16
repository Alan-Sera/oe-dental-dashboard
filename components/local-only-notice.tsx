import { Database, FolderLock, HardDrive, ServerOff } from "lucide-react";

import { Card } from "@/components/ui/card";

export function LocalOnlyNotice() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-5 px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-md bg-coral-900 text-coral-400">
          <ServerOff className="size-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-coral-400">Deploy no compatible</p>
          <h1 className="text-2xl font-semibold text-white">OE Dental Dashboard es local-first</h1>
        </div>
      </div>

      <Card className="space-y-4">
        <p className="text-sm leading-6 text-ink-300">
          Esta versión guarda la base SQLite en <code>data/app.db</code> y los expedientes en{" "}
          <code>data/vault</code>. Vercel ejecuta la app en funciones serverless sin un disco
          persistente para este flujo, por eso un deploy directo no puede conservar pacientes,
          pagos, fotos ni historia clínica.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <Info icon={Database} title="SQLite local" text="Requiere un archivo de base de datos en la computadora." />
          <Info icon={FolderLock} title="Bóveda local" text="Copia documentos a una carpeta privada del proyecto." />
          <Info icon={HardDrive} title="Backups locales" text="Restaura desde carpetas dentro de data/backups." />
        </div>
      </Card>

      <Card>
        <h2 className="section-title mb-3">Cómo abrirla en tu computadora</h2>
        <pre className="overflow-x-auto rounded-md bg-ink-950 p-4 text-sm text-ink-200">
          <code>{`cd "C:\\Users\\halo_\\Desktop\\oe_directory_prueba\\oe-dental-dashboard"
pnpm install
pnpm db:init
pnpm dev -H 127.0.0.1 -p 3001`}</code>
        </pre>
        <p className="mt-3 text-sm text-ink-500">Después entra a http://127.0.0.1:3001</p>
      </Card>
    </main>
  );
}

function Info({
  icon: Icon,
  title,
  text
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="surface p-4">
      <Icon className="mb-3 size-5 text-mint-500" aria-hidden="true" />
      <p className="text-sm font-medium text-ink-100">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-500">{text}</p>
    </div>
  );
}
