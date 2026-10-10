import { LoadingProvider } from "@/components/loading-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>
      <LoadingProvider mode="fullscreen">
        <main className="flex min-h-screen items-center justify-center bg-lavender-950/25 px-4 py-8">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </LoadingProvider>
    </div>
  );
}
