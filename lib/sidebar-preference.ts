const SIDEBAR_COLLAPSED_KEY = "oe-dental-sidebar-collapsed:v1";

type SidebarPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function getStorage(
  storage?: SidebarPreferenceStorage,
): SidebarPreferenceStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readSidebarCollapsed(
  storage?: SidebarPreferenceStorage,
): boolean {
  try {
    return getStorage(storage)?.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage?: SidebarPreferenceStorage,
): void {
  try {
    getStorage(storage)?.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
}
