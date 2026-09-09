"use client";

import { ToastProvider, ToastPortal, ToastViewport, ToastRoot, ToastContent, ToastTitle, ToastDescription, ToastAction, ToastClose, ToastPrimitive } from "@/components/ui/toast";

export const toastManager = ToastPrimitive.createToastManager();

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toast) => (
    <ToastRoot key={toast.id} toast={toast}>
      <ToastContent>
        <div className="min-w-0 flex-1">
          <ToastTitle>{toast.title}</ToastTitle>
          {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
          {toast.actionProps ? <ToastAction {...toast.actionProps} /> : null}
        </div>
      </ToastContent>
      <ToastClose />
    </ToastRoot>
  ));
}

export function ToastProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider toastManager={toastManager} timeout={0}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}
