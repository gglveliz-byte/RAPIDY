import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");
  const indexPath = path.resolve(distPath, "index.html");

  app.use("*", serveStatic({ root: "./dist/public" }));

  // Fallback para todas las rutas SPA (ej. /politica-de-privacidad, /eliminar-cuenta, /legal, etc.)
  app.on(["GET", "HEAD"], "*", (c) => {
    const url = new URL(c.req.url);
    const ext = path.extname(url.pathname);
    
    // Si es un archivo estático no encontrado (.png, .css, .js, etc.), devolver 404
    if (ext && ext !== ".html") {
      return c.json({ error: "File Not Found" }, 404);
    }

    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      c.header("Content-Type", "text/html; charset=utf-8");
      return c.html(content, 200);
    }
    return c.text("Ya Llega App", 200);
  });
}
