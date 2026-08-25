"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { logout } from "@/lib/actions/auth.actions";
import { useGlobalLoading } from "@/components/loading-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LogoutButton({
  className,
  formClassName
}: {
  className?: string;
  formClassName?: string;
} = {}) {
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className={formClassName}
      onSubmit={(event) => {
        event.preventDefault();
        loading.show("Cerrando sesión...");
        startTransition(async () => {
          try {
            await logout();
          } catch (error) {
            loading.hide();
            throw error;
          }
        });
      }}
    >
      <Button
        variant="secondary"
        size="sm"
        type="submit"
        aria-label="Salir"
        disabled={isPending}
        className={cn(
          "border-coral-400/55 bg-coral-900/60 text-coral-300 shadow-[0_0_18px_rgba(244,114,99,0.14)] backdrop-blur-md hover:border-coral-300/70 hover:bg-coral-500 hover:text-white focus-visible:ring-coral-300/60",
          className
        )}
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span>Salir</span>
      </Button>
    </form>
  );
}
