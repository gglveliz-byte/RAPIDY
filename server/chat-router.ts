import { z } from "zod";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, participantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { chatMessages } from "@db/schema";
import { emit } from "./events";
import { assertOrderAccess } from "./lib/order-access";
import type { ViewerRole } from "@contracts/orderStatus";

function senderTypeForViewer(role: ViewerRole): "customer" | "commerce" | "driver" {
  if (role === "customer") return "customer";
  if (role === "driver") return "driver";
  if (role === "merchant") return "commerce";
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "El administrador no puede enviar mensajes como cliente, comercio o repartidor.",
  });
}

export const chatRouter = createRouter({
  send: participantQuery
    .input(
      z.object({
        orderId: z.number().int().positive(),
        message: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000),
        /** Opcional: permite elegir entre roles propios (p. ej. driver que también es cliente). */
        as: z.enum(["customer", "driver", "merchant"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await assertOrderAccess(ctx, input.orderId);
      const { order, viewer } = access;

      if (viewer.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "El administrador solo puede leer." });
      }
      if (input.as && input.as !== viewer.role) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes enviar mensajes con un rol que no te corresponde.",
        });
      }
      if (viewer.role === "customer" && order.customerId !== ctx.customer!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No participas en este pedido." });
      }
      if (viewer.role === "driver" && order.driverId !== ctx.driver!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No participas en este pedido." });
      }

      const db = getDb();
      const since = new Date(Date.now() - 60_000);
      const recent = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.orderId, input.orderId),
            eq(chatMessages.senderType, senderTypeForViewer(viewer.role)),
            eq(chatMessages.senderId, viewer.id),
            gte(chatMessages.createdAt, since),
          ),
        );
      if (recent.length >= 20) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Estás enviando mensajes demasiado rápido. Espera un momento.",
        });
      }

      const inserted = await db
        .insert(chatMessages)
        .values({
          orderId: input.orderId,
          senderType: senderTypeForViewer(viewer.role),
          senderId: viewer.id,
          senderName: viewer.name,
          message: input.message,
        })
        .returning();

      emit(`order:${input.orderId}`, {
        type: "chat_message",
        orderId: input.orderId,
        messageId: inserted[0].id,
        senderType: inserted[0].senderType,
      });
      return inserted[0];
    }),

  getByOrder: participantQuery
    .input(
      z.object({
        orderId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(50),
        before: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertOrderAccess(ctx, input.orderId);
      const db = getDb();
      const rows = await db
        .select()
        .from(chatMessages)
        .where(
          input.before
            ? and(eq(chatMessages.orderId, input.orderId), lt(chatMessages.id, input.before))
            : eq(chatMessages.orderId, input.orderId),
        )
        .orderBy(desc(chatMessages.id))
        .limit(input.limit);
      return rows.reverse();
    }),

  markAsRead: participantQuery
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const access = await assertOrderAccess(ctx, input.orderId);
      if (access.viewer.role === "admin") return { success: true };

      const db = getDb();
      await db
        .update(chatMessages)
        .set({ isRead: "yes" })
        .where(
          and(
            eq(chatMessages.orderId, input.orderId),
            ne(chatMessages.senderType, senderTypeForViewer(access.viewer.role)),
            eq(chatMessages.isRead, "no"),
          ),
        );
      return { success: true };
    }),
});