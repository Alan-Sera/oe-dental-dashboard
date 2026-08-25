"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { logout } from "@/lib/actions/auth.actions";
import { useGlobalLoading } from "@/components/loading-provider";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();

  return (
    <form
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
      <Button variant="secondary" size="sm" type="submit" aria-label="Salir" disabled={isPending}>
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Salir</span>
      </Button>
    </form>
  );
}
