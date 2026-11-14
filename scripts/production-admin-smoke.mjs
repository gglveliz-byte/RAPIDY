/**
 * E2E de producción — Panel Administrativo.
 *
 * Cubre navegador (login, dashboard, rutas) y API (auth, settings, reportes,
 * comisión snapshot, driver online, entrega idempotente, settlement, pausa de
 * producto y revocación de sesión).
 *
 * Seguridad:
 * - En localhost las escrituras están habilitadas por defecto.
 * - Contra un host remoto se exige E2E_ADMIN_ALLOW_WRITES=1.
 * - Todos los pedidos/drivers temporales se identifican con un marcador único
 *   y se eliminan en finally. Settings, tasa de comisión y producto se
 *   restauran a su valor original.
 *
 * Uso:
 *   node scripts/production-admin-smoke.mjs
 *   $env:E2E_BASE_URL="https://rapidy.example"; $env:E2E_ADMIN_ALLOW_WRITES="1"
 *   node scripts/production-admin-smoke.mjs
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(BASE_URL);
const ALLOW_WRITES = process.env.E2E_ADMIN_ALLOW_WRITES === "1" || IS_LOCAL;
const HAS_DB = Boolean(process.env.DATABASE_URL);
const WRITE_TESTS = ALLOW_WRITES && HAS_DB;
const SCREENSHOTS = process.env.E2E_ADMIN_SCREENSHOTS === "1";
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const MARKER = `Smoke admin prod ${RUN_ID}`;
const REPORT_TYPES = ["sales", "orders", "commerces", "drivers", "earnings", "commissions"];
const today = guayaquilDateKey();
const yesterday = guayaquilDateKey(new Date(Date.now() - 86_400_000));

const results = [];
let skipped = 0;

function record(name, ok, detail = "") {
  const clean = String(detail ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${clean ? ` — ${clean}` : ""}`);
  return ok;
}

function skip(name, detail = "") {
  skipped += 1;
  console.log(`SKIP ${name}${detail ? ` — ${detail}` : ""}`);
}

function errorMessage(result) {
  return (
    result?.data?.error?.json?.message ||
    result?.data?.error?.message ||
    result?.data?.message ||
    ""
  );
}

function payload(result) {
  return result?.data?.result?.data?.json ?? result?.data?.result?.data ?? null;
}

function guayaquilDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function hasSensitiveKey(value, keys) {
  if (Array.isArray(value)) return value.some((item) => hasSensitiveKey(item, keys));
  if (!value || typeof value !== "object") return false;
  return (
    keys.some((key) => key in value) ||
    Object.values(value).some((item) => hasSensitiveKey(item, keys))
  );
}

function jarFrom(response, jar = new Map()) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) jar.set(key, value);
    else jar.delete(key);
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function api(pathname, options = {}) {
  const { method = "GET", input, jar, rawCookie } = options;
  let url = `${BASE_URL}/api/trpc/${pathname}`;
  const headers = {};
  if (method === "GET") {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}`;
  } else {
    headers["content-type"] = "application/json";
  }
  const cookie = rawCookie ?? (jar ? cookieHeader(jar) : "");
  if (cookie) headers.cookie = cookie;

  const response = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({ json: input ?? {} }),
    signal: AbortSignal.timeout(20_000),
  });
  if (jar) jarFrom(response, jar);

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const apiGet = (pathname, input, jar, rawCookie) =>
  api(pathname, { method: "GET", input, jar, rawCookie });
const apiPost = (pathname, input, jar, rawCookie) =>
  api(pathname, { method: "POST", input, jar, rawCookie });

async function loginAdmin(jar) {
  const result = await apiPost(
    "login.login",
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    jar,
  );
  const body = payload(result);
  return {
    ...result,
    body,
    ok: result.status === 200 && body?.success === true && body?.role === "admin",
  };
}

function findChrome() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.CHROME_PATH,
    localAppData
      ? path.join(localAppData, "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe")
      : "",
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe")
      : "",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];

  if (localAppData) {
    const root = path.join(localAppData, "ms-playwright");
    if (fs.existsSync(root)) {
      try {
        const revisions = fs
          .readdirSync(root)
          .filter((entry) => entry.startsWith("chromium"))
          .sort()
          .reverse();
        for (const revision of revisions) {
          candidates.push(path.join(root, revision, "chrome-win64", "chrome.exe"));
          candidates.push(path.join(root, revision, "chrome-win", "chrome.exe"));
        }
      } catch {
        // La detección es best-effort; CHROME_PATH sigue siendo la vía estable.
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  try {
    const detected = chromium.executablePath();
    if (detected && fs.existsSync(detected)) return detected;
  } catch {
    // playwright-core no incluye navegador propio.
  }
  return null;
}

async function runBrowserSuite(chromePath) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
  } catch (error) {
    record("Chrome/Playwright disponible", false, error?.message || String(error));
    return null;
  }

  const anonContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await anonPage.waitForURL(/\/login(?:\?|$)/, { timeout: 15_000 }).catch(() => {});
    record(
      "Ruta admin anónima redirige a /login",
      new URL(anonPage.url()).pathname === "/login",
      anonPage.url(),
    );
  } catch (error) {
    record("Ruta admin anónima redirige a /login", false, error?.message || String(error));
  } finally {
    await anonContext.close().catch(() => {});
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const state = { browser, context, page, pageErrors, loggedIn: false };

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const emailTab = page.getByRole("button", { name: /Email \(Admin/i });
    if ((await emailTab.count()) > 0) await emailTab.first().click().catch(() => {});
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/admin", null, { timeout: 25_000 });
    await page
      .waitForFunction(
        () => document.body.innerText.toLowerCase().includes("pedidos totales"),
        null,
        { timeout: 20_000 },
      )
      .catch(() => {});
    state.loggedIn = true;
    record("Login admin en navegador", true, page.url());
  } catch (error) {
    record("Login admin en navegador", false, error?.message || String(error));
    return state;
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(
      () => document.body.innerText.toLowerCase().includes("pedidos totales"),
      null,
      { timeout: 20_000 },
    )
    .catch(() => {});
  record(
    "Sesión admin sobrevive reload",
    new URL(page.url()).pathname === "/admin" &&
      (await page.locator("body").innerText()).toLowerCase().includes("pedidos totales"),
    page.url(),
  );

  const routes = [
    ["/admin", "panel admin", "pedidos totales"],
    ["/admin/commerces", "comercios", "nuevo"],
    ["/admin/drivers", "repartidores", "desconectados"],
    ["/admin/orders", "pedidos", "pagos y cobros"],
    ["/admin/products", "productos", "más vendidos"],
    ["/admin/settings", "configuración", "reportes exportables"],
  ];

  for (const [route, heading, needle] of routes) {
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page
        .waitForFunction(
          (text) => document.body.innerText.toLowerCase().includes(text),
          needle,
          { timeout: 20_000 },
        )
        .catch(() => {});
      const body = (await page.locator("body").innerText()).toLowerCase();
      const h1 = await page
        .locator("h1")
        .first()
        .innerText()
        .catch(() => "");
      record(
        `Ruta ${route}`,
        new URL(page.url()).pathname === route &&
          body.includes(needle) &&
          h1.toLowerCase().includes(heading),
        h1 || body.slice(0, 140),
      );
    } catch (error) {
      record(`Ruta ${route}`, false, error?.message || String(error));
    }
  }

  try {
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_200);
    const filters = await page.getByRole("button", { name: /Entregados|En camino/i }).count();
    record("Pedidos muestra filtros de estado", filters > 0, String(filters));
    const settlementButtons = await page
      .getByRole("button", { name: /Pendiente|Saldado/i })
      .count();
    if (settlementButtons > 0) {
      record("Pedidos muestra acciones de liquidación", true, String(settlementButtons));
    } else {
      skip("Pedidos muestra acciones de liquidación", "no hay pedidos entregados visibles");
    }
  } catch (error) {
    record("Pedidos muestra filtros de estado", false, error?.message || String(error));
  }

  try {
    await page.goto(`${BASE_URL}/admin/products`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Todos los productos/i }).click();
    await page.waitForTimeout(1_500);
    const moderation = await page.getByRole("button", { name: /Pausar|Reactivar/i }).count();
    if (moderation > 0) {
      record("Productos muestra acciones de moderación", true, String(moderation));
    } else {
      skip("Productos muestra acciones de moderación", "el catálogo no tiene productos visibles");
    }
  } catch (error) {
    record("Productos muestra acciones de moderación", false, error?.message || String(error));
  }

  try {
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () => document.body.innerText.toLowerCase().includes("reportes exportables"),
        null,
        { timeout: 20_000 },
      )
      .catch(() => {});
    const body = (await page.locator("body").innerText()).toLowerCase();
    const reportButtons = await page.getByRole("button", { name: /^(PDF|Excel)$/i }).count();
    const saveButton = page.getByRole("button", { name: /Guardar configuración/i });
    record(
      "Settings muestra reportes exportables",
      body.includes("reportes exportables") && reportButtons >= REPORT_TYPES.length * 2,
      `${reportButtons} botones`,
    );
    record(
      "Settings formulario operable",
      (await saveButton.count()) > 0 && !(await saveButton.isDisabled()),
    );
  } catch (error) {
    record("Settings muestra reportes exportables", false, error?.message || String(error));
  }

  record(
    "Sin errores JS en Admin",
    pageErrors.length === 0,
    pageErrors.slice(0, 3).join(" | "),
  );

  if (SCREENSHOTS) {
    const dir = path.join("test-flow-screenshots", "production-admin");
    fs.mkdirSync(dir, { recursive: true });
    await page
      .goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" })
      .then(() => page.screenshot({ path: path.join(dir, `${RUN_ID}-admin.png`), fullPage: true }))
      .catch(() => {});
  }

  return state;
}

async function insertAdminOrder(pool, options) {
  const {
    status,
    commerceIds,
    driverId = null,
    driverCommissionRate = null,
    pickedUpCommerceIds = [],
    marker,
  } = options;

  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];
  if (!customer) throw new Error("No hay clientes para crear pedidos temporales.");

  const entries = [];
  for (const commerceId of commerceIds) {
    const product = (
      await pool.query(
        "select id, name, price from products where commerce_id = $1 order by id limit 1",
        [commerceId],
      )
    ).rows[0];
    if (!product) throw new Error(`No hay producto para el comercio ${commerceId}.`);
    entries.push({ commerceId, product });
  }

  const subtotal = entries.length * 10;
  const deliveryFee = 2.5;
  const total = subtotal + deliveryFee;
  const commerceStatus = ["delivered", "on_the_way", "picked_up"].includes(status)
    ? "picked_up"
    : "ready_for_pickup";

  const order = (
    await pool.query(
      `insert into orders
        (customer_id, driver_id, driver_commission_rate, picked_up_commerce_ids, status,
         subtotal, delivery_fee, commission, total, payment_method, delivery_address,
         customer_phone, delivered_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'cash', $10, $11, $12)
       returning id`,
      [
        customer.id,
        driverId,
        driverCommissionRate,
        pickedUpCommerceIds,
        status,
        subtotal.toFixed(2),
        deliveryFee.toFixed(2),
        entries.length.toFixed(2),
        total.toFixed(2),
        `${MARKER} ${marker}`,
        customer.phone || "0999999999",
        status === "delivered" ? new Date() : null,
      ],
    )
  ).rows[0];

  for (const { commerceId, product } of entries) {
    await pool.query(
      `insert into order_items
        (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
       values ($1, $2, $3, $4, '1', $5, '10.00')`,
      [order.id, product.id, commerceId, product.name, product.price],
    );
    await pool.query(
      `insert into order_commerce_status
        (order_id, commerce_id, status, commission_amount)
       values ($1, $2, $3, $4)`,
      [
        order.id,
        commerceId,
        commerceStatus,
        status === "delivered" ? "1.00" : null,
      ],
    );
  }

  return order.id;
}

async function createTempDriver(adminJar) {
  const phone = `09${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
  const result = await apiPost(
    "admin.createDriver",
    {
      name: `${MARKER} driver`,
      phone,
      password: "Smoke12345",
      vehicle: "Moto smoke",
      licensePlate: "SMK-PROD",
      commissionRate: "75.00",
    },
    adminJar,
  );
  return { result, body: payload(result), phone };
}

async function cleanupTempData(pool, temp) {
  if (!pool || temp.cleanupDone) return temp.cleanupOk;
  const errors = [];
  const attempt = async (label, query, params = []) => {
    try {
      await pool.query(query, params);
    } catch (error) {
      errors.push(`${label}: ${error?.message || error}`);
    }
  };

  for (const orderId of temp.orderIds) {
    await attempt(
      `earnings #${orderId}`,
      "delete from driver_earnings where order_id = $1",
      [orderId],
    );
    await attempt(`order #${orderId}`, "delete from orders where id = $1", [orderId]);
  }

  const markerPattern = `${MARKER}%`;
  await attempt(
    "earnings por marcador",
    "delete from driver_earnings where order_id in (select id from orders where delivery_address like $1)",
    [markerPattern],
  );
  await attempt(
    "orders por marcador",
    "delete from orders where delivery_address like $1",
    [markerPattern],
  );
  await attempt(
    "drivers por marcador",
    "delete from drivers where name like $1",
    [markerPattern],
  );

  for (const [id, state] of temp.originalProducts) {
    await attempt(
      `producto #${id}`,
      "update products set is_available = $1, admin_paused = $2 where id = $3",
      [state.is_available, state.admin_paused, id],
    );
  }

  for (const [id, rate] of temp.originalCommerceRates) {
    await attempt(
      `comercio #${id}`,
      "update commerces set commission_rate = $1 where id = $2",
      [rate, id],
    );
  }

  for (const [key, value] of Object.entries(temp.originalSettings)) {
    await attempt(
      `setting ${key}`,
      "update app_settings set value = $1, updated_at = now() where key = $2",
      [value, key],
    );
  }

  try {
    const remainingOrders = (
      await pool.query(
        "select count(*)::int as count from orders where delivery_address like $1",
        [markerPattern],
      )
    ).rows[0].count;
    const remainingDrivers = (
      await pool.query("select count(*)::int as count from drivers where name like $1", [
        markerPattern,
      ])
    ).rows[0].count;
    const productsOk = [];
    for (const [id, state] of temp.originalProducts) {
      const row = (
        await pool.query("select is_available, admin_paused from products where id = $1", [id])
      ).rows[0];
      productsOk.push(
        Boolean(row) &&
          row.is_available === state.is_available &&
          row.admin_paused === state.admin_paused,
      );
    }
    const ratesOk = [];
    for (const [id, rate] of temp.originalCommerceRates) {
      const row = (
        await pool.query("select commission_rate from commerces where id = $1", [id])
      ).rows[0];
      ratesOk.push(Boolean(row) && String(row.commission_rate) === String(rate));
    }
    const cleanupOk =
      errors.length === 0 &&
      remainingOrders === 0 &&
      remainingDrivers === 0 &&
      productsOk.every(Boolean) &&
      ratesOk.every(Boolean);
    record(
      "Limpieza de datos temporales",
      cleanupOk,
      errors[0] || `${remainingOrders} pedidos, ${remainingDrivers} drivers`,
    );
    temp.cleanupOk = cleanupOk;
    temp.cleanupDone = cleanupOk;
  } catch (error) {
    record("Limpieza de datos temporales", false, error?.message || String(error));
    temp.cleanupOk = false;
  }

  return temp.cleanupOk;
}

async function runWriteSuite(pool, adminJar, temp) {
  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];
  const productRows = (
    await pool.query(
      `select c.id as commerce_id, c.commission_rate,
              p.id as product_id, p.name as product_name, p.price
         from commerces c
         join products p on p.commerce_id = c.id
        order by c.id, p.id`,
    )
  ).rows;

  const commerceMap = new Map();
  for (const row of productRows) {
    if (!commerceMap.has(row.commerce_id)) commerceMap.set(row.commerce_id, row);
  }
  const commerces = [...commerceMap.values()];
  if (!customer || commerces.length === 0) {
    skip(
      "Commission snapshot / driver online / entrega idempotente",
      "faltan clientes o productos en la base de datos",
    );
    return;
  }

  const first = commerces[0];
  const second = commerces[1];

  // Settings originales para restaurar en finally.
  const settingsRows = payload(await apiGet("admin.settings", undefined, adminJar)) ?? [];
  for (const row of settingsRows) {
    temp.originalSettings[row.key] = row.value ?? "";
  }

  // 1. Comisión snapshot de comercio.
  const commissionsBefore =
    payload(await apiGet("admin.commerceCommissions", undefined, adminJar)) ?? [];
  const beforeCommission = Number(
    commissionsBefore.find((row) => Number(row.commerceId) === Number(first.commerce_id))
      ?.commissionEarned ?? 0,
  );

  const commissionOrderId = await insertAdminOrder(pool, {
    status: "delivered",
    commerceIds: [first.commerce_id],
    marker: "comision",
  });
  temp.orderIds.push(commissionOrderId);

  const commissionsAfter =
    payload(await apiGet("admin.commerceCommissions", undefined, adminJar)) ?? [];
  const afterCommission = Number(
    commissionsAfter.find((row) => Number(row.commerceId) === Number(first.commerce_id))
      ?.commissionEarned ?? 0,
  );
  record(
    "Comisión snapshot suma el monto histórico",
    Math.abs(afterCommission - beforeCommission - 1) < 0.01,
    `${beforeCommission} -> ${afterCommission}`,
  );

  const ordersList =
    payload(
      await apiGet("admin.orders", { limit: 200, offset: 0 }, adminJar),
    ) ?? [];
  const snapshotOrder = ordersList.find((order) => order.id === commissionOrderId);
  record(
    "admin.orders muestra comisión snapshot",
    Number(snapshotOrder?.commerceSettlements?.[0]?.commission ?? 0) === 1,
    String(snapshotOrder?.commerceSettlements?.[0]?.commission),
  );

  const detail = payload(
    await apiGet("admin.orderDetail", { id: commissionOrderId }, adminJar),
  );
  record(
    "Detalle de pedido conserva comisión snapshot",
    Number(detail?.commerceStatuses?.[0]?.commissionAmount ?? 0) === 1,
    String(detail?.commerceStatuses?.[0]?.commissionAmount),
  );

  const commissionsReport = payload(
    await apiPost(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar,
    ),
  );
  const reportCommissionRow = (commissionsReport?.rows ?? []).find(
    (row) => Number(row["Pedido ID"]) === commissionOrderId,
  );
  record(
    "Reporte de comisiones usa snapshot",
    Number(reportCommissionRow?.Comision ?? 0) === 1,
    String(reportCommissionRow?.Comision),
  );

  temp.originalCommerceRates.set(first.commerce_id, first.commission_rate);
  const alternateRate =
    Number(first.commission_rate) === 20 ? "15.00" : "20.00";
  const rateUpdate = await apiPost(
    "admin.updateCommerce",
    { id: Number(first.commerce_id), commissionRate: alternateRate },
    adminJar,
  );
  record(
    "Tasa de comisión actualizada para prueba",
    rateUpdate.status === 200,
    errorMessage(rateUpdate) || alternateRate,
  );

  const ordersAfterRate =
    payload(
      await apiGet("admin.orders", { limit: 200, offset: 0 }, adminJar),
    ) ?? [];
  const snapshotAfterRate = ordersAfterRate.find((order) => order.id === commissionOrderId);
  record(
    "Cambiar tasa no reescribe comisión snapshot",
    Number(snapshotAfterRate?.commerceSettlements?.[0]?.commission ?? 0) === 1,
    String(snapshotAfterRate?.commerceSettlements?.[0]?.commission),
  );

  const reportAfterRate = payload(
    await apiPost(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar,
    ),
  );
  const reportRowAfterRate = (reportAfterRate?.rows ?? []).find(
    (row) => Number(row["Pedido ID"]) === commissionOrderId,
  );
  record(
    "Reporte conserva snapshot tras cambiar tasa",
    Number(reportRowAfterRate?.Comision ?? 0) === 1,
    String(reportRowAfterRate?.Comision),
  );

  const dashboard = payload(
    await apiGet("admin.dashboard", undefined, adminJar),
  );
  record(
    "Dashboard incluye comisión histórica",
    Number(dashboard?.totalCommission ?? 0) > 0,
    String(dashboard?.totalCommission),
  );

  // 2. Settlement multi-comercio.
  const settlementCommerceIds = [first.commerce_id, second?.commerce_id].filter(Boolean);
  const settlementOrderId = await insertAdminOrder(pool, {
    status: "delivered",
    commerceIds: settlementCommerceIds,
    marker: "settlement",
  });
  temp.orderIds.push(settlementOrderId);

  const settleOne = await apiPost(
    "admin.toggleCommerceSettled",
    { id: settlementOrderId, commerceId: Number(first.commerce_id) },
    adminJar,
  );
  const settlementRows = (
    await pool.query(
      "select commerce_id, settled_at from order_commerce_status where order_id = $1 order by commerce_id",
      [settlementOrderId],
    )
  ).rows;
  const settlementOrderRow = (
    await pool.query("select commerce_settled from orders where id = $1", [
      settlementOrderId,
    ])
  ).rows[0];
  const firstSettled = Boolean(settlementRows[0]?.settled_at);
  const secondSettled =
    settlementRows.length > 1 ? Boolean(settlementRows[1]?.settled_at) : null;
  record(
    "Settlement liquida solo el comercio elegido",
    settleOne.status === 200 &&
      firstSettled &&
      (settlementRows.length === 1
        ? settlementOrderRow.commerce_settled === true
        : secondSettled === false && settlementOrderRow.commerce_settled === false),
    settlementRows.map((row) => `${row.commerce_id}:${Boolean(row.settled_at)}`).join(","),
  );

  if (settlementRows.length > 1) {
    const settleAll = await apiPost(
      "admin.toggleCommerceSettled",
      { id: settlementOrderId },
      adminJar,
    );
    const allRows = (
      await pool.query(
        "select settled_at from order_commerce_status where order_id = $1 order by commerce_id",
        [settlementOrderId],
      )
    ).rows;
    const orderAfterAll = (
      await pool.query("select commerce_settled from orders where id = $1", [
        settlementOrderId,
      ])
    ).rows[0];
    record(
      "Settlement total concilia el pedido",
      settleAll.status === 200 &&
        allRows.every((row) => row.settled_at !== null) &&
        orderAfterAll.commerce_settled === true,
    );
  } else {
    skip("Settlement total concilia el pedido", "solo hay un comercio con productos");
  }

  // 3. Driver online + entrega idempotente + comisión snapshot de driver.
  const createdDriver = await createTempDriver(adminJar);
  const driver = createdDriver.body;
  if (createdDriver.result.status !== 200 || !driver?.id) {
    record(
      "Alta de driver temporal",
      false,
      errorMessage(createdDriver.result) || `HTTP ${createdDriver.result.status}`,
    );
    skip("Driver online / entrega idempotente", "no se pudo crear el driver temporal");
    return;
  }
  temp.driverIds.push(driver.id);
  record(
    "Alta de driver temporal sin secretos",
    !hasSensitiveKey(driver, ["passwordHash", "fcmToken"]),
    `driver #${driver.id}`,
  );

  const driverInitial = (
    await pool.query("select status from drivers where id = $1", [driver.id])
  ).rows[0];
  record("Nuevo driver inicia offline", driverInitial.status === "offline", driverInitial.status);

  const driverOrderId = await insertAdminOrder(pool, {
    status: "ready_for_pickup",
    commerceIds: [first.commerce_id],
    marker: "driver-online",
  });
  temp.orderIds.push(driverOrderId);

  const offlineAssign = await apiPost(
    "admin.assignDriver",
    { orderId: driverOrderId, driverId: driver.id },
    adminJar,
  );
  record(
    "No asigna repartidor offline",
    offlineAssign.status >= 400 && /desconectado/i.test(errorMessage(offlineAssign)),
    errorMessage(offlineAssign),
  );

  await pool.query("update drivers set status = 'online' where id = $1", [driver.id]);
  const assign = await apiPost(
    "admin.assignDriver",
    { orderId: driverOrderId, driverId: driver.id },
    adminJar,
  );
  const assignedOrder = (
    await pool.query(
      "select status, driver_id, driver_commission_rate from orders where id = $1",
      [driverOrderId],
    )
  ).rows[0];
  const busyDriver = (
    await pool.query("select status from drivers where id = $1", [driver.id])
  ).rows[0];
  record(
    "Asigna repartidor online y lo marca ocupado",
    assign.status === 200 &&
      assignedOrder.status === "driver_assigned" &&
      Number(assignedOrder.driver_id) === Number(driver.id) &&
      busyDriver.status === "busy",
    `${assignedOrder.status}/${busyDriver.status}`,
  );

  const editDriver = await apiPost(
    "admin.updateDriver",
    { id: driver.id, commissionRate: "50.00" },
    adminJar,
  );
  record("Admin actualiza comisión del driver", editDriver.status === 200);

  const pickUp = await apiPost(
    "admin.updateOrderStatus",
    { id: driverOrderId, status: "picked_up" },
    adminJar,
  );
  const onTheWay = await apiPost(
    "admin.updateOrderStatus",
    { id: driverOrderId, status: "on_the_way" },
    adminJar,
  );
  record(
    "Pedido avanza a retirado y en camino",
    pickUp.status === 200 && onTheWay.status === 200,
    `${pickUp.status}/${onTheWay.status}`,
  );

  const firstDelivery = await apiPost(
    "admin.updateOrderStatus",
    { id: driverOrderId, status: "delivered" },
    adminJar,
  );
  const deliveredOne = (
    await pool.query(
      "select delivered_at, driver_commission_rate from orders where id = $1",
      [driverOrderId],
    )
  ).rows[0];
  const earningRows = (
    await pool.query(
      "select amount from driver_earnings where order_id = $1 and type = 'delivery_fee'",
      [driverOrderId],
    )
  ).rows;
  const driverAfterDelivery = (
    await pool.query("select status from drivers where id = $1", [driver.id])
  ).rows[0];
  record(
    "Entrega usa comisión congelada al asignar",
    firstDelivery.status === 200 &&
      Number(earningRows[0]?.amount) === 1.88 &&
      Number(deliveredOne.driver_commission_rate) === 75 &&
      driverAfterDelivery.status === "online",
    `earning=${earningRows[0]?.amount}, rate=${deliveredOne.driver_commission_rate}, driver=${driverAfterDelivery.status}`,
  );

  const secondDelivery = await apiPost(
    "admin.updateOrderStatus",
    { id: driverOrderId, status: "delivered" },
    adminJar,
  );
  const deliveredTwo = (
    await pool.query("select delivered_at from orders where id = $1", [driverOrderId])
  ).rows[0];
  const deliveryHistory = (
    await pool.query(
      "select count(*)::int as count from order_status_history where order_id = $1 and status = 'delivered'",
      [driverOrderId],
    )
  ).rows[0].count;
  const earningsCount = (
    await pool.query(
      "select count(*)::int as count from driver_earnings where order_id = $1 and type = 'delivery_fee'",
      [driverOrderId],
    )
  ).rows[0].count;
  record(
    "Entrega repetida es idempotente",
    secondDelivery.status === 200 &&
      String(deliveredOne.delivered_at) === String(deliveredTwo.delivered_at) &&
      deliveryHistory === 1 &&
      earningsCount === 1,
    `${deliveredOne.delivered_at} / history=${deliveryHistory} / earnings=${earningsCount}`,
  );

  // 4. Pausa de producto.
  const product = (
    await pool.query(
      "select id, is_available, admin_paused from products where id = $1",
      [first.product_id],
    )
  ).rows[0];
  temp.originalProducts.set(product.id, {
    is_available: product.is_available,
    admin_paused: product.admin_paused,
  });

  if (product.admin_paused) {
    // Normaliza el estado para probar una pausa real; finally restaura el original.
    await apiPost("admin.toggleProductAvailability", { id: product.id }, adminJar);
  }
  const pause = await apiPost(
    "admin.toggleProductAvailability",
    { id: product.id },
    adminJar,
  );
  const pausedProduct = (
    await pool.query("select is_available, admin_paused from products where id = $1", [
      product.id,
    ])
  ).rows[0];
  record(
    "Pausa admin marca producto no disponible",
    pause.status === 200 &&
      pausedProduct.admin_paused === true &&
      pausedProduct.is_available === "no",
    `${pausedProduct.is_available}/${pausedProduct.admin_paused}`,
  );

  const merchantEmail = process.env.E2E_MERCHANT_EMAIL;
  const merchantPassword = process.env.E2E_MERCHANT_PASSWORD;
  const owner = (
    await pool.query(
      `select u.email
         from products p
         join commerces c on c.id = p.commerce_id
         left join users u on u.id = c.merchant_user_id
        where p.id = $1`,
      [product.id],
    )
  ).rows[0];

  if (
    merchantEmail &&
    merchantPassword &&
    owner?.email &&
    owner.email.toLowerCase() === merchantEmail.toLowerCase()
  ) {
    const merchantJar = new Map();
    const merchantLogin = await apiPost(
      "login.login",
      { email: merchantEmail, password: merchantPassword },
      merchantJar,
    );
    if (merchantLogin.status === 200 && payload(merchantLogin)?.success) {
      const merchantRevert = await apiPost(
        "product.update",
        { id: product.id, isAvailable: "yes" },
        merchantJar,
      );
      record(
        "Merchant no revierte pausa admin",
        merchantRevert.status >= 400 && /pausado/i.test(errorMessage(merchantRevert)),
        errorMessage(merchantRevert),
      );
    } else {
      skip("Merchant no revierte pausa admin", "login merchant falló");
    }
  } else {
    skip(
      "Merchant no revierte pausa admin",
      "define E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD del comercio probado",
    );
  }
}

async function runSessionRevocation(adminJar, browserState) {
  const revokeJar = new Map();
  const login = await loginAdmin(revokeJar);
  if (!login.ok) {
    record("Logout admin revoca access token", false, "no se pudo iniciar sesión secundaria");
    return;
  }
  const oldCookie = cookieHeader(revokeJar);

  const logout = await apiPost("login.logout", { scope: "admin" }, revokeJar);
  const oldDashboard = await apiGet("admin.dashboard", undefined, null, oldCookie);
  const oldCheck = await apiGet("login.checkAuth", undefined, null, oldCookie);
  const oldRefresh = await apiPost("login.refresh", {}, null, oldCookie);

  record(
    "Logout admin revoca access token",
    logout.status === 200 && oldDashboard.status === 401,
    `logout=${logout.status}, dashboard=${oldDashboard.status}`,
  );
  record(
    "Sesión revocada invalida checkAuth",
    payload(oldCheck)?.authenticated === false,
    String(payload(oldCheck)?.authenticated),
  );
  record(
    "Sesión revocada invalida refresh",
    payload(oldRefresh)?.success === false,
    String(payload(oldRefresh)?.success),
  );

  if (browserState?.loggedIn) {
    try {
      await browserState.page.goto(`${BASE_URL}/admin`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await browserState.page
        .waitForURL(/\/login(?:\?|$)/, { timeout: 15_000 })
        .catch(() => {});
      record(
        "Sesión revocada redirige panel a /login",
        new URL(browserState.page.url()).pathname === "/login",
        browserState.page.url(),
      );
    } catch (error) {
      record(
        "Sesión revocada redirige panel a /login",
        false,
        error?.message || String(error),
      );
    }
  } else {
    skip("Sesión revocada redirige panel a /login", "navegador no disponible");
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.");
  }
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Run ID: ${RUN_ID}`);
  if (!HAS_DB) {
    console.log("AVISO: DATABASE_URL no definido; se omiten escrituras y limpieza SQL.");
  }
  if (!ALLOW_WRITES) {
    console.log(
      "MODO SEGURO: define E2E_ADMIN_ALLOW_WRITES=1 para validar escrituras y revocación de sesión.",
    );
  }

  const pool = HAS_DB
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
    : null;
  pool?.on("error", (error) => console.error("DB pool error:", error.message));

  const adminJar = new Map();
  const temp = {
    orderIds: [],
    driverIds: [],
    originalProducts: new Map(),
    originalCommerceRates: new Map(),
    originalSettings: {},
    cleanupDone: false,
    cleanupOk: true,
  };
  let browserState = null;

  try {
    // 401 anónimo antes de autenticar.
    const anonDashboard = await apiGet("admin.dashboard");
    const anonOrders = await apiGet("admin.orders", { limit: 5, offset: 0 });
    const anonSetting = await apiPost("admin.updateSetting", {
      key: "delivery_fee",
      value: "1.00",
    });
    record(
      "Anónimo recibe 401 en admin.dashboard",
      anonDashboard.status === 401,
      `HTTP ${anonDashboard.status}`,
    );
    record(
      "Anónimo recibe 401 en admin.orders",
      anonOrders.status === 401,
      `HTTP ${anonOrders.status}`,
    );
    record(
      "Anónimo recibe 401 en admin.updateSetting",
      anonSetting.status === 401,
      `HTTP ${anonSetting.status}`,
    );

    const login = await loginAdmin(adminJar);
    if (!login.ok) {
      throw new Error(
        `Login admin falló (HTTP ${login.status}): ${login.body?.message || errorMessage(login)}`,
      );
    }
    record("Login admin por API", true, `rol ${login.body.role}`);

    const checkAuth = payload(await apiGet("login.checkAuth", undefined, adminJar));
    record(
      "checkAuth devuelve sesión admin",
      checkAuth?.authenticated === true && checkAuth?.role === "admin",
      String(checkAuth?.role),
    );

    // Dashboard y endpoints que lo alimentan.
    const dashboard = payload(await apiGet("admin.dashboard", undefined, adminJar));
    record(
      "Dashboard admin responde KPIs",
      ["totalOrders", "totalRevenue", "totalCommission"].every(
        (key) => dashboard?.[key] !== null && Number.isFinite(Number(dashboard?.[key])),
      ),
      `orders=${dashboard?.totalOrders}, revenue=${dashboard?.totalRevenue}`,
    );

    const dashboardReads = [
      ["admin.salesByPeriod", { period: "day" }],
      ["admin.earningsByPeriod", { period: "day" }],
      ["admin.salesGrowth", { period: "day" }],
      ["admin.topCommerces", { limit: 5 }],
      ["admin.commerceCommissions", undefined],
      ["admin.driverEarningsBreakdown", undefined],
      ["admin.adminDeliveryEarnings", undefined],
      ["admin.categoryRanking", undefined],
      ["admin.topProducts", { limit: 5 }],
    ];
    let dashboardReadsOk = true;
    for (const [pathname, input] of dashboardReads) {
      const result = await apiGet(pathname, input, adminJar);
      if (result.status !== 200) {
        dashboardReadsOk = false;
        break;
      }
    }
    record("Endpoints del dashboard responden", dashboardReadsOk);

    // Comercios, drivers, pedidos y productos (sin secretos).
    const commerces = payload(await apiGet("admin.listCommerces", undefined, adminJar));
    record(
      "Comercios responde y no expone hashes",
      Array.isArray(commerces) && !hasSensitiveKey(commerces, ["passwordHash", "fcmToken"]),
      `${Array.isArray(commerces) ? commerces.length : "?"} filas`,
    );

    const drivers = payload(await apiGet("admin.driverPerformance", undefined, adminJar));
    record(
      "Drivers responde sin credenciales",
      Array.isArray(drivers) && !hasSensitiveKey(drivers, ["passwordHash", "fcmToken"]),
      `${Array.isArray(drivers) ? drivers.length : "?"} filas`,
    );

    const orders = payload(
      await apiGet("admin.orders", { limit: 100, offset: 0 }, adminJar),
    );
    record(
      "Pedidos responde paginado sin comprobantes",
      Array.isArray(orders) &&
        !hasSensitiveKey(orders, ["paymentReceipt", "idempotencyKey"]),
      `${Array.isArray(orders) ? orders.length : "?"} filas`,
    );

    const products = payload(
      await apiGet("admin.listProducts", { limit: 100, offset: 0 }, adminJar),
    );
    record(
      "Productos responde con estado de moderación",
      Array.isArray(products) &&
        (products.length === 0 ||
          products.every((product) => "adminPaused" in product && "isAvailable" in product)),
      `${Array.isArray(products) ? products.length : "?"} filas`,
    );

    const settings = payload(await apiGet("admin.settings", undefined, adminJar));
    record("Settings responde", Array.isArray(settings), `${Array.isArray(settings) ? settings.length : "?"} filas`);

    if (Array.isArray(orders) && orders.length > 0) {
      const detail = payload(
        await apiGet("admin.orderDetail", { id: orders[0].id }, adminJar),
      );
      record(
        "Detalle de pedido no expone credenciales de driver ni idempotencia",
        Boolean(detail) &&
          !hasSensitiveKey(detail.driver, ["passwordHash", "fcmToken"]) &&
          !("idempotencyKey" in detail),
        hasSensitiveKey(detail?.driver, ["passwordHash", "fcmToken"])
          ? "driver con credenciales"
          : "ok",
      );
    } else {
      skip(
        "Detalle de pedido no expone credenciales de driver ni idempotencia",
        "no hay pedidos",
      );
    }

    // Settings inválidos.
    const invalidSettings = [
      ["delivery_fee", "-1", "envío negativo"],
      ["delivery_fee", "2,50", "coma decimal"],
      ["delivery_fee", "abc", "texto no numérico"],
      ["delivery_fee", "100001", "monto fuera de rango"],
      ["app_name", "", "nombre vacío"],
      ["commission_rate", "50", "clave desconocida"],
    ];
    for (const [key, value, label] of invalidSettings) {
      const result = await apiPost("admin.updateSetting", { key, value }, adminJar);
      record(`Settings rechaza ${label}`, result.status >= 400, `HTTP ${result.status}`);
    }

    const duplicateBulk = await apiPost(
      "admin.updateSettingsBulk",
      {
        settings: [
          { key: "delivery_fee", value: "2.50" },
          { key: "delivery_fee", value: "2.50" },
        ],
      },
      adminJar,
    );
    record("Settings rechaza claves duplicadas", duplicateBulk.status >= 400);

    const validSetting = Array.isArray(settings)
      ? settings.find((row) => row.key === "delivery_fee") ||
        settings.find((row) => row.key === "app_name")
      : null;
    if (validSetting) {
      const sameValue = await apiPost(
        "admin.updateSetting",
        { key: validSetting.key, value: validSetting.value ?? "" },
        adminJar,
      );
      record("Settings acepta valor válido sin cambios", sameValue.status === 200);
    } else {
      skip("Settings acepta valor válido sin cambios", "no hay settings existentes");
    }

    // Reportes base.
    for (const type of REPORT_TYPES) {
      const report = payload(
        await apiPost(
          "admin.getReports",
          { type, startDate: today, endDate: today },
          adminJar,
        ),
      );
      const rows = report?.rows;
      const columns = report?.columns;
      record(
        `Reporte ${type} responde`,
        Array.isArray(rows) && Array.isArray(columns) && rows.length >= 0,
        `${Array.isArray(rows) ? rows.length : "?"} filas`,
      );
      if (type === "orders" && Array.isArray(rows)) {
        record(
          "Reporte de pedidos sin comprobantes",
          rows.every(
            (row) => !("paymentReceipt" in row) && !("Comprobante" in row),
          ),
        );
      }
    }

    const badRange = await apiPost(
      "admin.getReports",
      { type: "orders", startDate: today, endDate: yesterday },
      adminJar,
    );
    record("Reportes rechaza rango invertido", badRange.status >= 400);

    const hugeRange = await apiPost(
      "admin.getReports",
      { type: "orders", startDate: "2020-01-01", endDate: today },
      adminJar,
    );
    record("Reportes rechaza rango mayor a 2 años", hugeRange.status >= 400);

    // Navegador: login, dashboard, rutas, settings y reportes.
    const chromePath = findChrome();
    if (chromePath) {
      browserState = await runBrowserSuite(chromePath);
    } else {
      record(
        "Chrome/Playwright disponible",
        false,
        "define CHROME_PATH o instala Chromium de Playwright",
      );
      skip("Rutas admin en navegador", "navegador no disponible");
    }

    if (WRITE_TESTS) {
      await runWriteSuite(pool, adminJar, temp);
      await cleanupTempData(pool, temp);
    } else {
      skip(
        "Comisión snapshot",
        "requiere E2E_ADMIN_ALLOW_WRITES=1 y DATABASE_URL",
      );
      skip("Driver online", "requiere E2E_ADMIN_ALLOW_WRITES=1 y DATABASE_URL");
      skip(
        "Entrega idempotente",
        "requiere E2E_ADMIN_ALLOW_WRITES=1 y DATABASE_URL",
      );
      skip("Settlement", "requiere E2E_ADMIN_ALLOW_WRITES=1 y DATABASE_URL");
      skip(
        "Pausa de producto",
        "requiere E2E_ADMIN_ALLOW_WRITES=1 y DATABASE_URL",
      );
    }

    if (ALLOW_WRITES) {
      await runSessionRevocation(adminJar, browserState);
    } else {
      skip("Sesión revocada", "requiere E2E_ADMIN_ALLOW_WRITES=1");
    }
  } finally {
    if (WRITE_TESTS) {
      try {
        await cleanupTempData(pool, temp);
      } catch (error) {
        record("Limpieza de datos temporales", false, error?.message || String(error));
      }
    }
    if (browserState?.browser) {
      await browserState.browser.close().catch(() => {});
    }
    if (pool) {
      await pool.end().catch(() => {});
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\nRESULT ${results.length - failed.length}/${results.length} PASS` +
      (skipped ? `, ${skipped} SKIP` : ""),
  );
  if (failed.length > 0) {
    console.log(`FALLOS: ${failed.map((result) => result.name).join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("PRODUCTION ADMIN SMOKE FAILED:", error?.message || error);
  process.exitCode = 1;
});