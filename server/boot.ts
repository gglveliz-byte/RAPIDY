import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import * as cookie from "cookie";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { subscribe } from "./events";
import {
  verifyAdminTokenPayload,
  verifyAdminRefreshTokenPayload,
} from "./admin-auth";
import { getDb } from "./queries/connection";
import { commerces, orderItems, orders, users, drivers, customers } from "@db/schema";
import { verifyAccessTokenPayload, verifyRefreshTokenPayload } from "./customer-auth";
import {
  verifyDriverTokenPayload,
  verifyDriverRefreshTokenPayload,
} from "./driver-auth";
import {
  verifyMerchantTokenPayload,
  verifyMerchantRefreshTokenPayload,
} from "./merchant-auth";

async function seedAdmin() {
  try {
    const { seedAdminUser } = await import("./login-router");
    await seedAdminUser();
  } catch (e) {
    console.warn("[boot] seedAdmin failed:", e);
  }
}

const app = new Hono<{ Bindings: HttpBindings }>();

seedAdmin();

app.use("*", async (c, next) => {
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: https://*.tile.openstreetmap.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://images.unsplash.com https://picsum.photos; font-src 'self' data: https://fonts.gstatic.com; worker-src 'self' blob:;");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

function setupSSE(c: any, channel: string, stream: any) {
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  let closed = false;
  const unsubscribe = subscribe(channel, (data: any) => {
    if (closed) return;
    try {
      stream.writeSSE({ data: JSON.stringify(data), event: "update" });
    } catch (err) {
      console.warn(`[SSE] write failed on ${channel}:`, (err as Error)?.message);
    }
  });

  // Clean up when the client disconnects (or the stream is aborted by the framework)
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      unsubscribe();
    } catch {}
  };

  if (typeof stream.onAbort === "function") {
    stream.onAbort(cleanup);
  }
  const signal = (c.req as any)?.raw?.signal as AbortSignal | undefined;
  if (signal && !signal.aborted) {
    signal.addEventListener("abort", cleanup, { once: true });
  }

  return { cleanup, isClosed: () => closed };
}

type SseIdentity = {
  role: "customer" | "driver" | "merchant" | "admin";
  id: number;
};

async function resolveSseIdentities(c: any): Promise<SseIdentity[]> {
  const cookies = cookie.parse(c.req.header("cookie") || "");
  const identities: SseIdentity[] = [];
  const seen = new Set<string>();
  const db = getDb();
  const add = (role: SseIdentity["role"], id: number | null | undefined) => {
    if (!id) return;
    const key = `${role}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    identities.push({ role, id });
  };

  const validAdmin = async (payload: { userId: number; sessionVersion: number | null } | null) => {
    if (!payload) return null;
    const rows = await db
      .select({ role: users.role, sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    const user = rows[0];
    if (!user || user.role !== "admin") return null;
    if (
      payload.sessionVersion !== null &&
      (user.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      return null;
    }
    return payload.userId;
  };

  const validMerchant = async (payload: { userId: number; sessionVersion: number | null } | null) => {
    if (!payload) return null;
    const rows = await db
      .select({ role: users.role, sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    const user = rows[0];
    if (!user || user.role !== "merchant") return null;
    if (
      payload.sessionVersion !== null &&
      (user.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      return null;
    }
    return payload.userId;
  };

  const validDriver = async (payload: { driverId: number; sessionVersion: number | null } | null) => {
    if (!payload) return null;
    const rows = await db
      .select({ sessionVersion: drivers.sessionVersion })
      .from(drivers)
      .where(eq(drivers.id, payload.driverId))
      .limit(1);
    const driver = rows[0];
    if (!driver) return null;
    if (
      payload.sessionVersion !== null &&
      (driver.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      return null;
    }
    return payload.driverId;
  };

  const validCustomer = async (
    payload: { customerId: number; sessionVersion?: number | null } | null,
  ) => {
    if (!payload) return null;
    const rows = await db
      .select({ sessionVersion: customers.sessionVersion, deletedAt: customers.deletedAt })
      .from(customers)
      .where(eq(customers.id, payload.customerId))
      .limit(1);
    const customer = rows[0];
    if (!customer || customer.deletedAt) return null;
    if (
      typeof payload.sessionVersion === "number" &&
      (customer.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      return null;
    }
    return payload.customerId;
  };

  if (cookies.quickgo_admin_token) {
    add("admin", await validAdmin(await verifyAdminTokenPayload(cookies.quickgo_admin_token)));
  }
  if (cookies.quickgo_admin_refresh) {
    add(
      "admin",
      await validAdmin(await verifyAdminRefreshTokenPayload(cookies.quickgo_admin_refresh)),
    );
  }
  if (cookies.quickgo_token) {
    add("customer", await validCustomer(await verifyAccessTokenPayload(cookies.quickgo_token)));
  }
  if (cookies.refresh_token) {
    add("customer", await validCustomer(await verifyRefreshTokenPayload(cookies.refresh_token)));
  }
  if (cookies.quickgo_driver_token) {
    add(
      "driver",
      await validDriver(await verifyDriverTokenPayload(cookies.quickgo_driver_token)),
    );
  }
  if (cookies.quickgo_driver_refresh) {
    add(
      "driver",
      await validDriver(await verifyDriverRefreshTokenPayload(cookies.quickgo_driver_refresh)),
    );
  }
  if (cookies.quickgo_merchant_token) {
    add(
      "merchant",
      await validMerchant(await verifyMerchantTokenPayload(cookies.quickgo_merchant_token)),
    );
  }
  if (cookies.quickgo_merchant_refresh) {
    add(
      "merchant",
      await validMerchant(
        await verifyMerchantRefreshTokenPayload(cookies.quickgo_merchant_refresh),
      ),
    );
  }

  return identities;
}

async function canAccessOrder(identities: SseIdentity[], orderId: number): Promise<boolean> {
  if (identities.length === 0) return false;
  if (identities.some((identity) => identity.role === "admin")) return true;

  const db = getDb();
  const rows = await db
    .select({ customerId: orders.customerId, driverId: orders.driverId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (!order) return false;

  if (identities.some((identity) => identity.role === "customer" && identity.id === order.customerId)) {
    return true;
  }
  if (identities.some((identity) => identity.role === "driver" && identity.id === order.driverId)) {
    return true;
  }

  const merchantIds = identities
    .filter((identity) => identity.role === "merchant")
    .map((identity) => identity.id);
  if (merchantIds.length === 0) return false;

  const items = await db
    .select({ commerceId: orderItems.commerceId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const commerceIds = [...new Set(items.map((item) => item.commerceId))];
  if (commerceIds.length === 0) return false;

  const owned = await db
    .select({ id: commerces.id })
    .from(commerces)
    .where(
      and(
        inArray(commerces.id, commerceIds),
        inArray(commerces.merchantUserId, merchantIds),
      ),
    )
    .limit(1);
  return owned.length > 0;
}

async function canAccessCommerce(identities: SseIdentity[], commerceId: number): Promise<boolean> {
  if (identities.length === 0) return false;
  if (identities.some((identity) => identity.role === "admin")) return true;

  const merchantIds = identities
    .filter((identity) => identity.role === "merchant")
    .map((identity) => identity.id);
  if (merchantIds.length === 0) return false;

  const db = getDb();
  const owned = await db
    .select({ id: commerces.id })
    .from(commerces)
    .where(
      and(
        eq(commerces.id, commerceId),
        inArray(commerces.merchantUserId, merchantIds),
      ),
    )
    .limit(1);
  return owned.length > 0;
}

// SSE endpoints for real-time updates
app.get("/api/events/orders/:orderId", async (c) => {
  const orderId = Number(c.req.param("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) return c.text("Bad Request", 400);
  const identities = await resolveSseIdentities(c);
  if (!(await canAccessOrder(identities, orderId))) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, `order:${orderId}`, stream);

    try {
      while (!isClosed()) {
        await stream.sleep(15000);
        if (isClosed()) break;
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
        } catch {}
      }
    } finally {
      cleanup();
    }
  });
});

app.get("/api/events/commerce/:commerceId", async (c) => {
  const commerceId = Number(c.req.param("commerceId"));
  if (!Number.isInteger(commerceId) || commerceId <= 0) return c.text("Bad Request", 400);
  const identities = await resolveSseIdentities(c);
  if (!(await canAccessCommerce(identities, commerceId))) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, `commerce:${commerceId}`, stream);

    try {
      while (!isClosed()) {
        await stream.sleep(15000);
        if (isClosed()) break;
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
        } catch {}
      }
    } finally {
      cleanup();
    }
  });
});

app.get("/api/events/driver/:driverId", async (c) => {
  const driverId = Number(c.req.param("driverId"));
  if (!Number.isInteger(driverId) || driverId <= 0) return c.text("Bad Request", 400);
  const identities = await resolveSseIdentities(c);
  const allowed = identities.some(
    (identity) =>
      identity.role === "admin" || (identity.role === "driver" && identity.id === driverId),
  );
  if (!allowed) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, `driver:${driverId}`, stream);

    try {
      while (!isClosed()) {
        await stream.sleep(15000);
        if (isClosed()) break;
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
        } catch {}
      }
    } finally {
      cleanup();
    }
  });
});

// SSE endpoint para el panel de administración (protegido por token/refresh cookie)
app.get("/api/events/admin-dashboard", async (c) => {
  const identities = await resolveSseIdentities(c);
  if (!identities.some((identity) => identity.role === "admin")) {
    return c.text("Unauthorized", 401);
  }

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, "admin:dashboard", stream);
    try {
      while (!isClosed()) {
        await stream.sleep(30000);
        if (isClosed()) break;
        stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
      }
    } finally {
      cleanup();
    }
  });
});

app.get("/api/events/commerces", async (c) => {
  const identities = await resolveSseIdentities(c);
  if (identities.length === 0) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, "commerces:global", stream);

    try {
      while (!isClosed()) {
        await stream.sleep(15000);
        if (isClosed()) break;
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
        } catch {}
      }
    } finally {
      cleanup();
    }
  });
});

app.get("/api/events/products", async (c) => {
  const identities = await resolveSseIdentities(c);
  if (identities.length === 0) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const { cleanup, isClosed } = setupSSE(c, "products:global", stream);

    try {
      while (!isClosed()) {
        await stream.sleep(15000);
        if (isClosed()) break;
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "ping" }), event: "update" });
        } catch {}
      }
    } finally {
      cleanup();
    }
  });
});

app.all("/api/trpc/*", async (c) => {
  console.log("[tRPC] matched:", c.req.method, c.req.path);
  try {
    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext,
    });
  } catch (err) {
    console.error("[tRPC] handler error:", err);
    throw err;
  }
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
