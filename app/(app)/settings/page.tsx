import { BackupControls } from "@/components/backup-controls";
import { SettingsForm } from "@/components/forms/settings-form";
import { Card } from "@/components/ui/card";
import { getClinicSettings, listLocalBackups } from "@/lib/actions/settings.actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, backups] = await Promise.all([getClinicSettings(), listLocalBackups()]);
  const serializedBackups = backups.map((backup) => ({
    ...backup,
    createdAt: backup.createdAt.toISOString()
  }));

  return (
    <main className="page-shell">
      <div>
        <h1 className="text-2xl font-semibold text-white">Ajustes</h1>
        <p className="muted">Configuración local</p>
      </div>

      <Card>
        <h2 className="section-title mb-4">Clínica</h2>
        <SettingsForm settings={settings} />
      </Card>

      <Card>
        <h2 className="section-title mb-4">Backups</h2>
        <BackupControls backups={serializedBackups} />
      </Card>
    </main>
  );
}
