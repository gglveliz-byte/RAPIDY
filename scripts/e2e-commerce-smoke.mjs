import "dotenv/config";
import pg from "pg";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;
const MERCHANT_EMAIL = process.env.E2E_MERCHANT_EMAIL || "comercio@test.com";
const MERCHANT_PASSWORD = process.env.E2E_MERCHANT_PASSWORD || "comercio123";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jarFrom(response, jar = new Map()) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return jar;
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
async function apiPost(path, input, jar) {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
    },
    body: JSON.stringify({ json: input }),
  });
  jarFrom(response, jar);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, response };
}
async function apiGet(path, input, jar) {
  const url = `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(
    JSON.stringify({ json: input ?? {} }),
  )}`;
  const response = await fetch(url, {
    headers: jar ? { cookie: cookieHeader(jar) } : {},
  });
  jarFrom(response, jar);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, response };
}
function trpcJson(result) {
  return result.data?.result?.data?.json;
}

async function createTestOrder(pool, status, commerceStatus) {
  const product = await pool.query(
    "select id, name, price from products where commerce_id = 1 order by id limit 1",
  );
  const customer = await pool.query("select id, phone from customers order by id limit 1");
  if (product.rows.length === 0 || customer.rows.length === 0) return null;

  const prod = product.rows[0];
  const cust = customer.rows[0];
  const order = await pool.query(
    `insert into orders
      (customer_id, status, subtotal, delivery_fee, commission, total, payment_method, delivery_address, customer_phone)
     values ($1, $2, '10.00', '2.50', '1.00', '12.50', 'cash', 'Dirección de prueba E2E', $3)
     returning id`,
    [cust.id, status, cust.phone || "0999999999"],
  );
  const orderId = order.rows[0].id;
  await pool.query(
    `insert into order_items
      (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
     values ($1, $2, 1, $3, '1', $4, '10.00')`,
    [orderId, prod.id, prod.name, prod.price],
  );
  await pool.query(
    `insert into order_commerce_status (order_id, commerce_id, status)
     values ($1, 1, $2)`,
    [orderId, commerceStatus],
  );
  return orderId;
}

async function cleanupOrder(pool, orderId) {
  if (!orderId) return;
  await pool.query("delete from orders where id = $1", [orderId]);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    // ── 1. Login merchant y sesión persistente ─────────────────────────────
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill(MERCHANT_EMAIL);
    await page.locator('input[type="password"]').fill(MERCHANT_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/commerce", null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    record("Login merchant", true, await page.url());

    const dashboardText = (await page.locator("body").innerText()).toLowerCase();
    record(
      "Dashboard carga",
      dashboardText.includes("pedidos entregados") || dashboardText.includes("accesos rápidos"),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    record("Sesión sobrevive reload", page.url().endsWith("/commerce"), page.url());

    const routes = [
      ["/commerce/orders", "pedidos"],
      ["/commerce/products", "catálogo"],
      ["/commerce/stats", "métricas"],
      ["/commerce/profile", "perfil"],
    ];
    for (const [route, expected] of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page
        .waitForFunction(
          (text) => document.body.innerText.toLowerCase().includes(text),
          expected,
          { timeout: 15000 },
        )
        .catch(() => {});
      const body = (await page.locator("body").innerText()).toLowerCase();
      const ok = page.url().endsWith(route) && body.includes(expected);
      record(`Ruta ${route}`, ok, page.url());
    }

    await page.goto(`${BASE_URL}/commerce/foo`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    record(
      "Ruta inválida no expulsa al merchant",
      !page.url().includes("/login") && !page.url().includes("/customer-login"),
      page.url(),
    );
    await page.goto(`${BASE_URL}/commerce`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    record("Sesión sigue viva tras ruta inválida", page.url().endsWith("/commerce"));

    // ── 2. APIs críticas del negocio ───────────────────────────────────────
    const jar = new Map();
    const login = await apiPost(
      "login.login",
      { email: MERCHANT_EMAIL, password: MERCHANT_PASSWORD },
      jar,
    );
    const loginData = trpcJson(login);
    record("API login merchant", login.status === 200 && loginData?.role === "merchant");

    const auth = await apiGet("login.checkAuth", undefined, jar);
    const authData = trpcJson(auth);
    record(
      "checkAuth devuelve commerceId",
      auth.status === 200 && authData?.role === "merchant" && Number(authData?.user?.commerceId) > 0,
    );

    const negativePrice = await apiPost(
      "product.create",
      { commerceId: 1, name: "Producto precio inválido E2E", price: "-5", unitType: "unit" },
      jar,
    );
    record("Precio negativo rechazado", negativePrice.status >= 400);

    const zeroPrice = await apiPost(
      "product.create",
      { commerceId: 1, name: "Producto precio cero E2E", price: "0", unitType: "unit" },
      jar,
    );
    record("Precio cero rechazado", zeroPrice.status >= 400);

    const statusAttempt = await apiPost("commerce.update", { id: 1, status: "suspended" }, jar);
    const statusData = trpcJson(statusAttempt);
    record(
      "Merchant no puede cambiar status",
      statusAttempt.status === 200 && statusData?.status === "active",
      String(statusData?.status),
    );

    // ── 3. markReady no revive estados terminales ──────────────────────────
    const cancelledId = await createTestOrder(pool, "cancelled", "cancelled");
    if (cancelledId) {
      const cancelled = await apiPost(
        "commerce.markReady",
        { orderId: cancelledId, commerceId: 1 },
        jar,
      );
      record("markReady rechaza cancelled", cancelled.status >= 400);
      await cleanupOrder(pool, cancelledId);
    } else {
      record("markReady rechaza cancelled", false, "No hay producto/cliente para crear pedido de prueba");
    }

    const rejectedId = await createTestOrder(pool, "payment_rejected", "payment_rejected");
    if (rejectedId) {
      const rejected = await apiPost(
        "commerce.markReady",
        { orderId: rejectedId, commerceId: 1 },
        jar,
      );
      record("markReady rechaza payment_rejected", rejected.status >= 400);
      await cleanupOrder(pool, rejectedId);
    }

    const normalId = await createTestOrder(pool, "received", "received");
    if (normalId) {
      const normal = await apiPost(
        "commerce.markReady",
        { orderId: normalId, commerceId: 1 },
        jar,
      );
      const row = await pool.query("select status from orders where id = $1", [normalId]);
      record(
        "markReady avanza received",
        normal.status === 200 && row.rows[0]?.status === "ready_for_pickup",
        String(row.rows[0]?.status),
      );
      await cleanupOrder(pool, normalId);
    }

    // ── 4. Logout merchant no toca cookies de cliente ──────────────────────
    const logout = await apiPost("login.logout", { scope: "merchant" }, jar);
    const setCookies = (logout.response.headers.getSetCookie?.() ?? []).join("\n");
    record(
      "Logout merchant no borra cookies customer",
      !setCookies.includes("quickgo_token=") && !setCookies.includes("refresh_token="),
    );
    record("Logout merchant responde", logout.status === 200);

    record("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("E2E COMMERCE FAILED:", error);
  process.exitCode = 1;
});