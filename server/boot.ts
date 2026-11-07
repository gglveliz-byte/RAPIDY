import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { subscribe } from "./events";
import { verifyAdminToken, verifyAdminRefreshToken } from "./admin-auth";

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
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://*.tile.openstreetmap.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://images.unsplash.com https://picsum.photos; font-src 'self' data:; worker-src 'self' blob:;");
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

// SSE endpoints for real-time updates
app.get("/api/events/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
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
  const commerceId = c.req.param("commerceId");
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
  const driverId = c.req.param("driverId");
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
  const cookieHeader = c.req.header("cookie") || "";
  const tokenMatch = cookieHeader.match(/quickgo_admin=([^;]+)/);
  const refreshMatch = cookieHeader.match(/quickgo_admin_refresh=([^;]+)/);

  let isAdmin = false;
  if (tokenMatch) {
    const adminId = await verifyAdminToken(tokenMatch[1]);
    if (adminId) isAdmin = true;
  }
  if (!isAdmin && refreshMatch) {
    const adminId = await verifyAdminRefreshToken(refreshMatch[1]);
    if (adminId) isAdmin = true;
  }

  if (!isAdmin) {
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
