import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireCustomerAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.customer) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  return next({ ctx: { ...ctx, customer: ctx.customer } });
});

const requireAdminAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.admin || ctx.admin.role !== "admin") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Admin authentication required",
    });
  }

  return next({ ctx: { ...ctx, admin: ctx.admin } });
});

const requireDriverAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.driver) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Driver authentication required",
    });
  }

  return next({ ctx: { ...ctx, driver: ctx.driver } });
});

const requireMerchantAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.merchant) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Merchant authentication required",
    });
  }

  return next({ ctx: { ...ctx, merchant: ctx.merchant } });
});

const requireAnyAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.customer && !ctx.driver && !ctx.merchant && !ctx.admin) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next();
});

export const customerQuery = t.procedure.use(requireCustomerAuth);
export const adminQuery = t.procedure.use(requireAdminAuth);
export const driverQuery = t.procedure.use(requireDriverAuth);
export const merchantQuery = t.procedure.use(requireMerchantAuth);
export const participantQuery = t.procedure.use(requireAnyAuth);
