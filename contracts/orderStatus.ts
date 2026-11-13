/**
 * Contrato único de estados de pedido.
 * Importable tanto por el backend (Hono/tRPC) como por el frontend (React).
 * No debe contener JSX ni dependencias de runtime.
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "payment_rejected",
  "received",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "driver_assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderStatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "brand"
  | "success"
  | "danger";

export interface OrderStatusMeta {
  /** Etiqueta completa en español para detalle/seguimiento. */
  label: string;
  /** Etiqueta corta para badges y listas. */
  shortLabel: string;
  /** Descripción para el cliente. */
  description: string;
  /** Paso del stepper del cliente (0-5); -1 si no pertenece al flujo normal. */
  step: number;
  terminal: boolean;
  tone: OrderStatusTone;
  /** Clases de badge (fondo + texto + borde). */
  badgeClass: string;
  /** Color principal para iconos/puntos. */
  dotClass: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  pending_payment: {
    label: "Esperando confirmación del pago",
    shortLabel: "Pago pendiente",
    description: "Estamos revisando tu comprobante de transferencia.",
    step: 0,
    terminal: false,
    tone: "warning",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
  },
  payment_rejected: {
    label: "Pago rechazado",
    shortLabel: "Pago rechazado",
    description: "El comprobante no pudo validarse. Puedes subir uno nuevo.",
    step: -1,
    terminal: false,
    tone: "danger",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
  },
  received: {
    label: "Pedido recibido",
    shortLabel: "Recibido",
    description: "El comercio recibió tu pedido y lo está confirmando.",
    step: 0,
    terminal: false,
    tone: "info",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    dotClass: "bg-sky-500",
  },
  accepted: {
    label: "Pedido aceptado",
    shortLabel: "Aceptado",
    description: "El comercio aceptó tu pedido.",
    step: 0,
    terminal: false,
    tone: "info",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    dotClass: "bg-sky-500",
  },
  preparing: {
    label: "En preparación",
    shortLabel: "Preparando",
    description: "Están preparando tu pedido.",
    step: 1,
    terminal: false,
    tone: "brand",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-[#FF6A00]",
  },
  ready_for_pickup: {
    label: "Listo para retirar",
    shortLabel: "Listo",
    description: "Tu pedido está listo. Estamos asignando un repartidor.",
    step: 2,
    terminal: false,
    tone: "brand",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-[#FF6A00]",
  },
  driver_assigned: {
    label: "Repartidor asignado",
    shortLabel: "Asignado",
    description: "Un repartidor tomará tu pedido.",
    step: 2,
    terminal: false,
    tone: "info",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    dotClass: "bg-sky-500",
  },
  picked_up: {
    label: "Pedido retirado",
    shortLabel: "Retirado",
    description: "El repartidor ya recogió tu pedido.",
    step: 3,
    terminal: false,
    tone: "info",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    dotClass: "bg-sky-500",
  },
  on_the_way: {
    label: "En camino",
    shortLabel: "En camino",
    description: "Tu pedido va en camino a la dirección de entrega.",
    step: 4,
    terminal: false,
    tone: "brand",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-[#FF6A00]",
  },
  delivered: {
    label: "Entregado",
    shortLabel: "Entregado",
    description: "¡Tu pedido fue entregado! Gracias por comprar en Rapidy.",
    step: 5,
    terminal: true,
    tone: "brand",
    badgeClass: "bg-[#FF6A00]/10 text-[#FF6A00] border-[#FF6A00]/30",
    dotClass: "bg-[#FF6A00]",
  },
  cancelled: {
    label: "Pedido cancelado",
    shortLabel: "Cancelado",
    description: "El pedido fue cancelado.",
    step: -1,
    terminal: true,
    tone: "danger",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
  },
};

export const CUSTOMER_TIMELINE_STEPS = [
  { key: "received", label: "Recibido" },
  { key: "preparing", label: "Preparando" },
  { key: "ready_for_pickup", label: "Listo" },
  { key: "picked_up", label: "Retirado" },
  { key: "on_the_way", label: "En camino" },
  { key: "delivered", label: "Entregado" },
] as const;

export function getOrderStatusMeta(status: string | null | undefined): OrderStatusMeta {
  if (status && status in ORDER_STATUS_META) {
    return ORDER_STATUS_META[status as OrderStatus];
  }
  return {
    label: "Estado desconocido",
    shortLabel: "Desconocido",
    description: "No pudimos determinar el estado del pedido.",
    step: -1,
    terminal: false,
    tone: "neutral",
    badgeClass: "bg-zinc-100 text-zinc-600 border-zinc-200",
    dotClass: "bg-zinc-400",
  };
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === "delivered" || status === "cancelled";
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return !!status && !isTerminalStatus(status) && status !== "payment_rejected";
}

/**
 * Estados globales que mandan sobre el estado de cocina por comercio.
 * Sirve para que el panel no muestre “preparando” cuando el pedido ya fue
 * cancelado, entregado, retirado o asignado a un repartidor.
 */
const COMMERCE_GLOBAL_OVERRIDES = new Set([
  "pending_payment",
  "payment_rejected",
  "driver_assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
]);

export function getCommerceOrderStatus(
  globalStatus: string | null | undefined,
  commerceStatus: string | null | undefined,
): string {
  if (globalStatus && COMMERCE_GLOBAL_OVERRIDES.has(globalStatus)) return globalStatus;
  return commerceStatus || globalStatus || "received";
}

/** Estados en los que el comercio todavía debe actuar en cocina. */
export function commerceCanPrepare(status: string | null | undefined): boolean {
  return status === "received" || status === "accepted";
}

export function commerceCanMarkReady(status: string | null | undefined): boolean {
  return status === "preparing";
}

export type ViewerRole = "customer" | "driver" | "merchant" | "admin";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["received", "payment_rejected", "cancelled"],
  payment_rejected: ["pending_payment", "cancelled"],
  received: ["accepted", "preparing", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["driver_assigned", "picked_up", "cancelled"],
  driver_assigned: ["picked_up", "cancelled"],
  picked_up: ["on_the_way", "delivered", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const ROLE_ALLOWED: Record<ViewerRole, OrderStatus[]> = {
  customer: ["cancelled", "pending_payment"],
  driver: ["picked_up", "on_the_way", "delivered"],
  merchant: ["accepted", "preparing", "cancelled"],
  admin: [...ORDER_STATUSES],
};

export function canTransition(
  from: string | null | undefined,
  to: OrderStatus,
  role: ViewerRole,
): boolean {
  if (!from || !(from in TRANSITIONS)) return false;
  if (!ROLE_ALLOWED[role].includes(to)) return false;
  return TRANSITIONS[from as OrderStatus].includes(to);
}

/** Estados en los que el cliente todavía puede cancelar sin soporte. */
export function customerCanCancel(status: string | null | undefined): boolean {
  return status === "pending_payment" || status === "received" || status === "accepted";
}