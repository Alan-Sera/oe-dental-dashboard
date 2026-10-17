import type { ClinicSettings } from "@/lib/actions/settings.actions";
import { DesktopAppFrame } from "@/components/desktop-app-frame";
import { ToastProviders } from "@/components/toast-providers";

export function AppShell({
  settings,
  children,
}: {
  settings: ClinicSettings;
  children: React.ReactNode;
}) {
  return (
    <ToastProviders>
      <div className="min-h-screen bg-ink-950 text-ink-100">
        <DesktopAppFrame settings={settings}>{children}</DesktopAppFrame>
      </div>
    </ToastProviders>
  );
}
