import { z } from "zod";
import { createRouter, publicQuery, customerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { customers } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { setCustomerCookies, clearCustomerCookies, verifyRefreshToken } from "./customer-auth";

export const customerRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().min(6),
        address: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.select().from(customers).where(eq(customers.phone, input.phone));
      let customer;
      if (existing.length > 0) {
        customer = existing[0];
      } else {
        const result = await db.insert(customers).values(input).returning();
        customer = result[0];
      }

      await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
      return { success: true, customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, address: customer.address } };
    }),

  login: publicQuery
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      let result = await db.select().from(customers).where(eq(customers.phone, input.phone));
      
      // Fallback: buscar por dígitos si no coincide exacto
      if (result.length === 0) {
        const digits = input.phone.replace(/\D/g, "");
        if (digits.length >= 7) {
          result = await db
            .select()
            .from(customers)
            .where(sql`REGEXP_REPLACE(${customers.phone}, '[^0-9]', '', 'g') LIKE ${'%' + digits.slice(-8)}`);
        }
      }

      if (result.length === 0) {
        return { success: false, customer: null };
      }
      const customer = result[0];
      await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
      return { success: true, customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, address: customer.address } };
    }),

  checkAuth: publicQuery.query(async ({ ctx }) => {
    const customer = ctx.customer || null;
    return { customer };
  }),

  refresh: publicQuery.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req?.headers?.get?.("cookie") || "";
    const tokenMatch = cookieHeader.match(/refresh_token=([^;]+)/);
    if (!tokenMatch) return { success: false, customer: null };

    const customerId = await verifyRefreshToken(tokenMatch[1]);
    if (!customerId) return { success: false, customer: null };

    const db = getDb();
    const result = await db.select().from(customers).where(eq(customers.id, customerId));
    if (result.length === 0) return { success: false, customer: null };

    const customer = result[0];
    await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
    return { success: true, customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, address: customer.address } };
  }),

  logout: publicQuery.mutation(async ({ ctx }) => {
    await clearCustomerCookies(ctx.resHeaders);
    return { success: true };
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(customers).where(eq(customers.id, input.id));
      return result[0] || null;
    }),

  update: customerQuery
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const customerId = ctx.customer?.id;
      if (!customerId) return null;
      await db.update(customers).set(input).where(eq(customers.id, customerId));
      const result = await db.select().from(customers).where(eq(customers.id, customerId));
      return result[0];
    }),

  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(customers);
  }),

  registerDeviceToken: customerQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!ctx.customer?.id) return { success: false };
      await db.update(customers).set({ fcmToken: input.token }).where(eq(customers.id, ctx.customer.id));
      return { success: true };
    }),
});