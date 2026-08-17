export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-lavender-950/25 px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
