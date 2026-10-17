export type RouteHistory = {
  routes: string[];
  index: number;
};

/** Returns the one-step history direction for the target route, defaulting to Back for unseen entries. */
export function getRouteHistoryDelta(history: RouteHistory, target: string): number {
  if (history.routes[history.index - 1] === target) return -1;
  if (history.routes[history.index + 1] === target) return 1;

  const knownIndex = history.routes.lastIndexOf(target);
  if (knownIndex >= 0 && knownIndex !== history.index) {
    return knownIndex - history.index;
  }

  return -1;
}

/** Moves the tracked browser route pointer, adding unknown entries after the current route. */
export function moveRouteHistory(
  history: RouteHistory,
  target: string,
  delta: number,
): RouteHistory {
  const nextIndex = history.index + delta;
  if (history.routes[nextIndex] === target) {
    return { routes: history.routes, index: nextIndex };
  }

  const knownIndex = history.routes.lastIndexOf(target);
  if (knownIndex >= 0) return { routes: history.routes, index: knownIndex };

  const routes = history.routes.slice(0, history.index + 1);
  routes.push(target);
  return { routes, index: routes.length - 1 };
}

/** Tracks route changes initiated by Next navigation while preserving Back/Forward entries. */
export function recordObservedRoute(history: RouteHistory, route: string): RouteHistory {
  if (history.routes[history.index] === route) return history;
  if (history.routes[history.index + 1] === route) {
    return { routes: history.routes, index: history.index + 1 };
  }
  if (history.routes[history.index - 1] === route) {
    return { routes: history.routes, index: history.index - 1 };
  }

  const routes = history.routes.slice(0, history.index + 1);
  routes.push(route);
  return { routes, index: routes.length - 1 };
}
