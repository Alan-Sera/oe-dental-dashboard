"use client";

import {
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastPrimitive,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export const toastManager = ToastPrimitive.createToastManager();
export const missingFilesToastManager = ToastPrimitive.createToastManager();

const dismissedToastIds = new Set<string>();

export function isDismissedToast(toastId: string): boolean {
  return dismissedToastIds.has(toastId);
}

export function markDismissedToast(toastId: string) {
  dismissedToastIds.add(toastId);
}

export function closeAllToasts() {
  toastManager.close();
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toast) => {
    if (isDismissedToast(toast.id)) return null;

    return (
      <ToastRoot key={toast.id} toast={toast}>
        <ToastContent>
          <div className="min-w-0 flex-1">
            <ToastTitle>{toast.title}</ToastTitle>
            {toast.description ? (
              <ToastDescription>{toast.description}</ToastDescription>
            ) : null}
            {toast.actionProps ? <ToastAction {...toast.actionProps} /> : null}
          </div>
        </ToastContent>
        <ToastClose />
      </ToastRoot>
    );
  });
}

export function ToastProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToastProvider toastManager={toastManager} timeout={0} limit={3}>
        {children}
        <ToastPortal>
          <ToastViewport>
            <ToastList />
          </ToastViewport>
        </ToastPortal>
      </ToastProvider>

      <ToastProvider toastManager={missingFilesToastManager} timeout={8000} limit={1}>
        <ToastPortal className="oe-toast-viewport-top-right">
          <ToastViewport className="oe-toast-viewport-top-right">
            <ToastList />
          </ToastViewport>
        </ToastPortal>
      </ToastProvider>
    </>
  );
}
