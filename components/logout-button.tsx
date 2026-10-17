"use client";

import { useRef, useTransition } from "react";
import { LogOut } from "lucide-react";

import { logout } from "@/lib/actions/auth.actions";
import { useGlobalLoading } from "@/components/loading-provider";
import { useNavigationGuard } from "@/components/navigation-guard-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function LogoutButton({
  className,
  formClassName,
  iconOnly = false,
}: {
  className?: string;
  formClassName?: string;
  iconOnly?: boolean;
} = {}) {
  const loading = useGlobalLoading();
  const { hasPendingChanges, requestNavigation } = useNavigationGuard();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const button = (
    <Button
      variant="secondary"
      size="sm"
      type="submit"
      aria-label="Salir"
      disabled={isPending}
      onClick={(event) => {
        if (!hasPendingChanges()) return;
        event.preventDefault();
        requestNavigation(
          () => formRef.current?.requestSubmit(),
          "/login",
        );
      }}
      className={cn(
        "border-coral-400/55 bg-coral-900/60 text-coral-400 dark:text-lavender-100 shadow-[0_0_18px_rgba(244,114,99,0.14)] backdrop-blur-md hover:border-coral-300/70 hover:bg-coral-500 hover:text-white focus-visible:ring-coral-300/60",
        iconOnly && "min-w-0 p-0",
        className,
      )}
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className={iconOnly ? "sr-only" : undefined}>Salir</span>
    </Button>
  );

  return (
    <form
      ref={formRef}
      className={formClassName}
      onSubmit={(event) => {
        event.preventDefault();
        if (hasPendingChanges()) {
          requestNavigation(
            () => formRef.current?.requestSubmit(),
            "/login",
          );
          return;
        }
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
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent side="right">Salir</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </form>
  );
}
