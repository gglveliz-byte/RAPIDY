/**
 * @archivo src/hooks/useAdminNotification.ts
 * @modulo 04-admin-panel (Sistema de Notificaciones y Alertas Sonoras de Administración)
 * @proposito
 *   Emite alertas sonoras sintetizadas en tiempo real mediante Web Audio API (sin depender de archivos de audio
 *   externos ni CDNs), vibración y notificaciones flotantes interactivas (Sonner toast con redirección directa al pedido)
 *   cuando un cliente realiza un pedido con pago por transferencia bancaria o re-sube un comprobante de pago.
 *
 * @dependencias_externas
 *   - `react` (`useCallback`)
 *   - `sonner` (`toast`)
 *   - `react-router` (`useNavigate`)
 */

import { useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

export interface TransferAlertPayload {
  orderId: number;
  total?: string | number;
  customerPhone?: string;
  deliveryAddress?: string;
  isResubmit?: boolean;
}

export function useAdminNotification() {
  const navigate = useNavigate();

  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Primer tono acampanado (D5 - 587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Segundo tono más alto y brillante (A5 - 880.00 Hz) con ligero delay de 120ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.0, now + 0.12);
      gain2.gain.setValueAtTime(0.32, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.65);
    } catch {
      // Ignorar restricciones en entornos sin soporte de audio
    }
  }, []);

  const notifyNewTransfer = useCallback(
    (payload: TransferAlertPayload) => {
      // 1. Sonido acampanado
      playChime();

      // 2. Vibración háptica en dispositivos móviles
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {}

      // 3. Notificación nativa del sistema operativo
      try {
        if (typeof window !== "undefined" && "Notification" in window) {
          const title = payload.isResubmit
            ? `💳 Comprobante Re-subido: Pedido #${payload.orderId}`
            : `💳 Nueva Transferencia: Pedido #${payload.orderId}`;
          const body = `Monto: $${Number(payload.total || 0).toFixed(2)}. Pulsa para validar el comprobante.`;

          if (Notification.permission === "granted") {
            new Notification(title, { body, icon: "/pwa-192x192.png" });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((p) => {
              if (p === "granted") {
                new Notification(title, { body, icon: "/pwa-192x192.png" });
              }
            });
          }
        }
      } catch {}

      // 4. Toast visible interactivo con botón de acción directa
      const formattedTotal = Number(payload.total || 0).toFixed(2);
      toast.warning(
        payload.isResubmit
          ? `¡Comprobante re-subido en Pedido #${payload.orderId}!`
          : `¡Nueva transferencia por validar en Pedido #${payload.orderId}!`,
        {
          description: `Total: $${formattedTotal} • Requiere confirmación de fondos`,
          duration: 10000,
          action: {
            label: "Revisar Pedido",
            onClick: () => navigate(`/admin/orders?orderId=${payload.orderId}`),
          },
        },
      );
    },
    [navigate, playChime],
  );

  return { notifyNewTransfer, playChime };
}
