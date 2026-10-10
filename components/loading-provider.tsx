"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ScreenLoadingOverlay } from "@/components/screen-loading-overlay";

type LoadingMode = "content" | "fullscreen";

type LoadingContextValue = {
  show: (label?: string) => void;
  hide: () => void;
  startNavigation: (label?: string, target?: string) => void;
  startRouteFallback: (label: string) => () => void;
  isLoading: boolean;
};

const DEFAULT_LABEL = "Cargando...";
const SAFETY_TIMEOUT_MS = 12_000;
const MIN_DISPLAY_MS = 400;
const FADE_OUT_MS = 250;
const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({
  children,
  mode = "content",
}: {
  children: React.ReactNode;
  mode?: LoadingMode;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const activeRequestsRef = useRef(0);
  const navigationPendingRef = useRef(false);
  const routeFallbackCountRef = useRef(0);
  const navigationCommittedRef = useRef(false);
  const loadingVisibleRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimeRef = useRef<number>(0);
  const fadeOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (fadeOutTimeoutRef.current) {
      clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
  }, []);

  const hasPendingWork = useCallback(
    () => activeRequestsRef.current > 0 || navigationPendingRef.current,
    [],
  );

  const forceHide = useCallback(() => {
    activeRequestsRef.current = 0;
    navigationPendingRef.current = false;
    routeFallbackCountRef.current = 0;
    navigationCommittedRef.current = false;
    loadingVisibleRef.current = false;
    clearAllTimeouts();
    setIsFadingOut(false);
    setIsLoading(false);
  }, [clearAllTimeouts]);

  const startFadeOut = useCallback(() => {
    if (hasPendingWork()) return;
    setIsFadingOut(true);
    fadeOutTimeoutRef.current = setTimeout(() => {
      loadingVisibleRef.current = false;
      setIsFadingOut(false);
      setIsLoading(false);
    }, FADE_OUT_MS);
  }, [hasPendingWork]);

  const scheduleHideWhenIdle = useCallback(() => {
    if (hasPendingWork()) return;

    clearAllTimeouts();
    const elapsed = Date.now() - showTimeRef.current;
    if (elapsed < MIN_DISPLAY_MS) {
      fadeOutTimeoutRef.current = setTimeout(
        startFadeOut,
        MIN_DISPLAY_MS - elapsed,
      );
    } else {
      startFadeOut();
    }
  }, [clearAllTimeouts, hasPendingWork, startFadeOut]);

  const beginVisibleState = useCallback((nextLabel: string) => {
    setLabel(nextLabel);
    setIsFadingOut(false);
    if (!loadingVisibleRef.current) showTimeRef.current = Date.now();
    loadingVisibleRef.current = true;
    setIsLoading(true);
  }, []);

  const show = useCallback(
    (nextLabel = DEFAULT_LABEL) => {
      activeRequestsRef.current += 1;
      clearAllTimeouts();
      beginVisibleState(nextLabel);
      timeoutRef.current = setTimeout(forceHide, SAFETY_TIMEOUT_MS);
    },
    [beginVisibleState, clearAllTimeouts, forceHide],
  );

  const hide = useCallback(() => {
    activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);

    scheduleHideWhenIdle();
  }, [scheduleHideWhenIdle]);

  const startNavigation = useCallback(
    (nextLabel = "Cargando página...", targetUrl?: string) => {
      if (targetUrl && isCurrentRoute(targetUrl)) return;
      navigationPendingRef.current = true;
      navigationCommittedRef.current = false;
      clearAllTimeouts();
      beginVisibleState(nextLabel);
      timeoutRef.current = setTimeout(forceHide, SAFETY_TIMEOUT_MS);
    },
    [beginVisibleState, clearAllTimeouts, forceHide],
  );

  const startRouteFallback = useCallback(
    (nextLabel: string) => {
      const wasNavigationPending = navigationPendingRef.current;
      routeFallbackCountRef.current += 1;
      navigationPendingRef.current = true;
      if (!wasNavigationPending) navigationCommittedRef.current = true;
      clearAllTimeouts();
      beginVisibleState(nextLabel);
      timeoutRef.current = setTimeout(forceHide, SAFETY_TIMEOUT_MS);

      return () => {
        routeFallbackCountRef.current = Math.max(
          0,
          routeFallbackCountRef.current - 1,
        );
        if (
          routeFallbackCountRef.current === 0 &&
          navigationCommittedRef.current
        ) {
          navigationPendingRef.current = false;
          navigationCommittedRef.current = false;
          scheduleHideWhenIdle();
        }
      };
    },
    [beginVisibleState, clearAllTimeouts, forceHide, scheduleHideWhenIdle],
  );

  const completeNavigation = useCallback(() => {
    if (!navigationPendingRef.current) return;
    navigationCommittedRef.current = true;
    if (routeFallbackCountRef.current > 0) return;

    navigationPendingRef.current = false;
    navigationCommittedRef.current = false;
    scheduleHideWhenIdle();
  }, [scheduleHideWhenIdle]);

  useEffect(() => {
    const handlePopState = () => startNavigation();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [startNavigation]);

  useEffect(() => () => clearAllTimeouts(), [clearAllTimeouts]);

  const value = useMemo(
    () => ({
      show,
      hide,
      startNavigation,
      startRouteFallback,
      isLoading,
    }),
    [hide, isLoading, show, startNavigation, startRouteFallback],
  );

  return (
    <LoadingContext.Provider value={value}>
      <div className="relative min-h-screen">
        <Suspense fallback={null}>
          <LoadingRouteObserver onRouteChange={completeNavigation} />
        </Suspense>
        {children}
        {isLoading ? (
          <ScreenLoadingOverlay
            label={label}
            mode={mode}
            fading={isFadingOut}
          />
        ) : null}
      </div>
    </LoadingContext.Provider>
  );
}

function LoadingRouteObserver({
  onRouteChange,
}: {
  onRouteChange: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const previousRouteKeyRef = useRef(routeKey);

  useEffect(() => {
    if (previousRouteKeyRef.current === routeKey) return;
    previousRouteKeyRef.current = routeKey;
    onRouteChange();
  }, [onRouteChange, routeKey]);

  return null;
}

function isCurrentRoute(targetUrl: string) {
  try {
    const target = new URL(targetUrl, window.location.href);
    return (
      target.origin === window.location.origin &&
      target.pathname === window.location.pathname &&
      target.search === window.location.search &&
      target.hash === window.location.hash
    );
  } catch {
    return false;
  }
}

export function useGlobalLoading() {
  const context = useContext(LoadingContext);

  if (!context) {
    return {
      show: () => undefined,
      hide: () => undefined,
      startNavigation: () => undefined,
      startRouteFallback: () => () => undefined,
      isLoading: false,
    };
  }

  return context;
}
