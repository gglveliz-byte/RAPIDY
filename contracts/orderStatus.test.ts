import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  canTransition,
  customerCanCancel,
  getOrderStatusMeta,
  isTerminalStatus,
} from "./orderStatus";

describe("contrato de estados de pedido", () => {
  it("tiene metadata para todos los estados del enum", () => {
    for (const status of ORDER_STATUSES) {
      const meta = getOrderStatusMeta(status);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.shortLabel.length).toBeGreaterThan(0);
      expect(typeof meta.step).toBe("number");
    }
  });

  it("marca delivered y cancelled como terminales", () => {
    expect(isTerminalStatus("delivered")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("on_the_way")).toBe(false);
  });

  it("no permite transiciones inválidas ni de roles sin permiso", () => {
    expect(canTransition("delivered", "on_the_way", "driver")).toBe(false);
    expect(canTransition("received", "preparing", "customer")).toBe(false);
    expect(canTransition("received", "cancelled", "customer")).toBe(true);
    expect(canTransition("on_the_way", "delivered", "driver")).toBe(true);
    expect(canTransition("received", "preparing", "merchant")).toBe(true);
  });

  it("permite cancelar solo antes de la preparación para el cliente", () => {
    expect(customerCanCancel("pending_payment")).toBe(true);
    expect(customerCanCancel("received")).toBe(true);
    expect(customerCanCancel("preparing")).toBe(false);
    expect(customerCanCancel("on_the_way")).toBe(false);
  });

  it("devuelve un fallback seguro para estados desconocidos", () => {
    const meta = getOrderStatusMeta("estado_inventado");
    expect(meta.shortLabel).toBe("Desconocido");
    expect(meta.step).toBe(-1);
  });
});