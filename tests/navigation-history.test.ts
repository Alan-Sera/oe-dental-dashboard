import { describe, expect, it } from "vitest";

import {
  getRouteHistoryDelta,
  moveRouteHistory,
  recordObservedRoute,
} from "@/lib/navigation-history";

describe("seguimiento del historial de rutas", () => {
  it("reconoce Atrás y Adelante en rutas ya visitadas", () => {
    const history = { routes: ["/patients", "/patients/1?tab=files", "/agenda"], index: 2 };

    expect(getRouteHistoryDelta(history, "/patients/1?tab=files")).toBe(-1);
    expect(getRouteHistoryDelta({ ...history, index: 1 }, "/agenda")).toBe(1);
  });

  it("avanza al destino conocido y registra rutas nuevas sin conservar la rama descartada", () => {
    const history = { routes: ["/patients", "/patients/1", "/agenda"], index: 1 };

    expect(moveRouteHistory(history, "/agenda", 1)).toEqual({
      routes: history.routes,
      index: 2,
    });
    expect(recordObservedRoute(history, "/settings")).toEqual({
      routes: ["/patients", "/patients/1", "/settings"],
      index: 2,
    });
  });

  it("asume Atrás para una entrada previa aún no observada por la app", () => {
    expect(getRouteHistoryDelta({ routes: ["/patients/1"], index: 0 }, "/login")).toBe(-1);
  });
});
