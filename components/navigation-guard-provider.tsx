"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useGlobalLoading } from "@/components/loading-provider";
import {
  getRouteHistoryDelta,
  moveRouteHistory,
  recordObservedRoute,
  type RouteHistory,
} from "@/lib/navigation-history";

export type BlockedNavigation = {
  destination: string;
  resume: () => void;
  cancel: () => void;
};

export type NavigationBlocker = {
  hasUnsavedChanges: () => boolean;
  onNavigationBlocked: (request: BlockedNavigation) => void;
};

type NavigationGuardContextValue = {
  registerBlocker: (blocker: NavigationBlocker) => () => void;
  requestNavigation: (proceed: () => void, destination?: string) => boolean;
  hasPendingChanges: () => boolean;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { startNavigation } = useGlobalLoading();
  const blockerRef = useRef<NavigationBlocker | null>(null);
  const blockedRequestRef = useRef(false);
  const restoringPopRef = useRef(false);
  const allowedPopRef = useRef<{ target: string; delta: number } | null>(null);
  const currentRouteRef = useRef("");
  const historyRef = useRef<RouteHistory>({ routes: [], index: -1 });

  const registerBlocker = useCallback((blocker: NavigationBlocker) => {
    blockerRef.current = blocker;
    return () => {
      if (blockerRef.current !== blocker) return;
      blockerRef.current = null;
      if (blockedRequestRef.current) blockedRequestRef.current = false;
    };
  }, []);

  const requestNavigation = useCallback(
    (proceed: () => void, destination = "") => {
      if (blockedRequestRef.current) return true;

      const blocker = blockerRef.current;
      if (!blocker?.hasUnsavedChanges()) {
        proceed();
        return false;
      }

      blockedRequestRef.current = true;
      let settled = false;
      blocker.onNavigationBlocked({
        destination,
        resume: () => {
          if (settled) return;
          settled = true;
          blockedRequestRef.current = false;
          proceed();
        },
        cancel: () => {
          if (settled) return;
          settled = true;
          blockedRequestRef.current = false;
        },
      });
      return true;
    },
    [],
  );

  const hasPendingChanges = useCallback(
    () => Boolean(blockerRef.current?.hasUnsavedChanges()),
    [],
  );

  const handleDocumentClick = useCallback(
    (event: MouseEvent) => {
      if (!blockerRef.current?.hasUnsavedChanges()) return;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.dataset.navigationGuardHandled === "true" ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) return;

      const targetUrl = new URL(anchor.href, window.location.href);
      if (targetUrl.origin !== window.location.origin) return;
      const targetRoute = toRouteKey(targetUrl.pathname, targetUrl.search);
      if (targetRoute === currentRouteRef.current) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      requestNavigation(
        () => {
          startNavigation(anchor.dataset.loadingLabel ?? "Cargando pÃ¡gina...", targetUrl.href);
          router.push(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
        },
        targetUrl.href,
      );
    },
    [requestNavigation, router, startNavigation],
  );

  const handleBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    if (!blockerRef.current?.hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  }, []);

  const handlePopState = useCallback(
    (event: PopStateEvent) => {
      if (restoringPopRef.current) {
        restoringPopRef.current = false;
        event.stopImmediatePropagation();
        return;
      }

      const target = routeKeyFromLocation();
      const delta = getRouteHistoryDelta(historyRef.current, target);
      if (allowedPopRef.current?.target === target) {
        allowedPopRef.current = null;
        historyRef.current = moveRouteHistory(historyRef.current, target, delta);
        return;
      }

      if (target === currentRouteRef.current) return;
      if (!blockerRef.current?.hasUnsavedChanges()) {
        historyRef.current = moveRouteHistory(historyRef.current, target, delta);
        return;
      }

      event.stopImmediatePropagation();
      restoringPopRef.current = true;
      window.history.go(-delta);
      requestNavigation(() => {
        allowedPopRef.current = { target, delta };
        window.history.go(delta);
      }, target);
    },
    [requestNavigation],
  );

  useEffect(() => {
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, true);
    };
  }, [handleBeforeUnload, handleDocumentClick, handlePopState]);

  const handleObservedRoute = useCallback((nextRoute: string) => {
    if (historyRef.current.index < 0) {
      currentRouteRef.current = nextRoute;
      historyRef.current = { routes: [nextRoute], index: 0 };
      return;
    }
    if (currentRouteRef.current === nextRoute) return;
    currentRouteRef.current = nextRoute;
    historyRef.current = recordObservedRoute(historyRef.current, nextRoute);
  }, []);

  const value = useMemo(
    () => ({ registerBlocker, requestNavigation, hasPendingChanges }),
    [hasPendingChanges, registerBlocker, requestNavigation],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      <Suspense fallback={null}>
        <NavigationRouteObserver onRouteChange={handleObservedRoute} />
      </Suspense>
      {children}
    </NavigationGuardContext.Provider>
  );
}

function NavigationRouteObserver({ onRouteChange }: { onRouteChange: (route: string) => void }) {
  const route = useCurrentRouteKey();
  const previousRouteRef = useRef(route);

  useEffect(() => {
    if (previousRouteRef.current === route) {
      onRouteChange(route);
      return;
    }
    previousRouteRef.current = route;
    onRouteChange(route);
  }, [onRouteChange, route]);

  return null;
}

function useCurrentRouteKey() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return toRouteKey(pathname ?? "/", searchParams?.toString() ? `?${searchParams.toString()}` : "");
}

function routeKeyFromLocation() {
  return toRouteKey(window.location.pathname, window.location.search);
}

function toRouteKey(pathname: string, search: string) {
  const normalizedSearch = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).toString();
  return `${pathname}${normalizedSearch ? `?${normalizedSearch}` : ""}`;
}

export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    return {
      registerBlocker: () => () => undefined,
      hasPendingChanges: () => false,
      requestNavigation: (proceed: () => void) => {
        proceed();
        return false;
      },
    };
  }
  return context;
}
