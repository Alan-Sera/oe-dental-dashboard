import { MuelitaLoader } from "@/components/muelita-loader";

export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4">
      <div className="rounded-lg border border-lavender-500/35 bg-lavender-950/82 px-8 py-8 shadow-panel backdrop-blur-md sm:px-10">
        <MuelitaLoader label="Cargando acceso..." />
      </div>
    </div>
  );
}
