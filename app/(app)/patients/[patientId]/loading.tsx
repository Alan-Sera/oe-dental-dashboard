import { MuelitaLoader } from "@/components/muelita-loader";

export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-65px)]">
      <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center px-4">
        <div className="rounded-lg border border-lavender-500/35 bg-lavender-950/82 px-8 py-8 shadow-panel backdrop-blur-md sm:px-10">
          <MuelitaLoader label="Cargando expediente..." />
        </div>
      </div>
    </main>
  );
}
