"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";

import { MuelitaLoader } from "@/components/muelita-loader";
import { cn } from "@/lib/utils";

type LoadingMode = "content" | "fullscreen";

type LoadingContextValue = {
  show: (label?: string) => void;
  hide: () => void;
  isLoading: boolean;
};

const DEFAULT_LABEL = "Cargando...";
const SAFETY_TIMEOUT_MS = 12_000;
const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({
  children,
  mode = "content"
}: {
  children: React.ReactNode;
  mode?: LoadingMode;
}) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const activeRequestsRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafetyTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const forceHide = useCallback(() => {
    activeRequestsRef.current = 0;
    clearSafetyTimeout();
    setIsLoading(false);
  }, [clearSafetyTimeout]);

  const show = useCallback(
    (nextLabel = DEFAULT_LABEL) => {
      activeRequestsRef.current += 1;
      setLabel(nextLabel);
      setIsLoading(true);
      clearSafetyTimeout();
      timeoutRef.current = setTimeout(forceHide, SAFETY_TIMEOUT_MS);
    },
    [clearSafetyTimeout, forceHide]
  );

  const hide = useCallback(() => {
    activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);

    if (activeRequestsRef.current === 0) {
      clearSafetyTimeout();
      setIsLoading(false);
    }
  }, [clearSafetyTimeout]);

  useEffect(() => {
    forceHide();
  }, [forceHide, pathname]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!shouldShowNavigationLoader(event)) return;
      show("Cargando página...");
    }

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      clearSafetyTimeout();
    };
  }, [clearSafetyTimeout, show]);

  const value = useMemo(
    () => ({
      show,
      hide,
      isLoading
    }),
    [hide, isLoading, show]
  );

  return (
    <LoadingContext.Provider value={value}>
      <div className="relative min-h-screen">
        {children}
        {isLoading ? (
          <>
            <div
              className={cn(
                "z-40 bg-ink-950/55 backdrop-blur-sm",
                mode === "content" ? "absolute inset-0" : "fixed inset-0"
              )}
              aria-hidden="true"
            />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="pointer-events-auto rounded-lg border border-lavender-500/35 bg-lavender-950/82 px-8 py-8 shadow-panel backdrop-blur-md sm:px-10">
              <MuelitaLoader label={label} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </LoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(LoadingContext);

  if (!context) {
    return {
      show: () => undefined,
      hide: () => undefined,
      isLoading: false
    };
  }

  return context;
}

function shouldShowNavigationLoader(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) return false;
  if (!["http:", "https:"].includes(nextUrl.protocol)) return false;

  const currentUrl = new URL(window.location.href);
  const sameRoute =
    nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search;

  return !sameRoute;
}
