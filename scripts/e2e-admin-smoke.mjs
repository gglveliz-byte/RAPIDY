import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;
const SHOT_DIR = "test-flow-screenshots/rapidy-admin";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.");
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];
  const product = (
    await pool.query("select id, name, price from products where commerce_id = 1 order by id limit 1")
  ).rows[0];
  const settlementOrder = (
    await pool.query(
      `insert into orders
        (customer_id, status, subtotal, delivery_fee, commission, total, payment_method, delivery_address, customer_phone, delivered_at)
       values ($1, 'delivered', '10.00', '2.50', '1.00', '12.50', 'cash', 'Dirección e2e admin', $2, now())
       returning id`,
      [customer.id, customer.phone],
    )
  ).rows[0];
  await pool.query(
    `insert into order_items
      (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
     values ($1, $2, 1, $3, '1', $4, '10.00')`,
    [settlementOrder.id, product.id, product.name, product.price],
  );
  await pool.query(
    `insert into order_commerce_status (order_id, commerce_id, status, commission_amount)
     values ($1, 1, 'picked_up', '1.00')`,
    [settlementOrder.id],
  );

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Email \(Admin/i }).click().catch(() => {});
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/admin", null, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    record("Login admin", true, page.url());

    const homeText = (await page.locator("body").innerText()).toLowerCase();
    record(
      "Dashboard admin carga",
      homeText.includes("panel administrativo") || homeText.includes("panel admin"),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    record("Sesión admin sobrevive reload", page.url().endsWith("/admin"), page.url());

    const routes = [
      ["/admin/commerces", "comercios"],
      ["/admin/drivers", "repartidores"],
      ["/admin/orders", "pedidos"],
      ["/admin/products", "productos"],
      ["/admin/settings", "configuración"],
    ];

    for (const [route, expected] of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page
        .waitForFunction(
          (text) => document.body.innerText.toLowerCase().includes(text),
          expected,
          { timeout: 15_000 },
        )
        .catch(() => {});
      const body = (await page.locator("body").innerText()).toLowerCase();
      record(`Ruta ${route}`, page.url().endsWith(route) && body.includes(expected), page.url());
    }

    // Moderación de productos: comprobar que las acciones están conectadas.
    await page.goto(`${BASE_URL}/admin/products`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Todos los productos/i }).click();
    await page.waitForTimeout(2000);
    const productActions = await page.getByRole("button", { name: /Pausar|Reactivar/i }).count();
    record("Productos muestra acciones de moderación", productActions > 0, String(productActions));

    // Settlement por comercio en pedidos entregados.
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: /Pendiente|Saldado/i })
      .first()
      .waitFor({ timeout: 12_000 })
      .catch(() => {});
    const settlementButtons = await page.getByRole("button", { name: /Pendiente|Saldado/i }).count();
    const ordersBody = (await page.locator("body").innerText()).toLowerCase();
    record(
      "Pedidos muestra liquidación",
      settlementButtons > 0,
      settlementButtons > 0
        ? String(settlementButtons)
        : ordersBody.slice(0, 300).replace(/\s+/g, " "),
    );

    // Guardado atómico de settings.
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const saveButton = page.getByRole("button", { name: /Guardar configuración/i });
    const saveDisabledBefore = await saveButton.isDisabled();
    await saveButton.click();
    const saveSucceeded = await page
      .waitForFunction(
        () =>
          document.body.innerText.toLowerCase().includes("configuración guardada"),
        null,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    const settingsText = (await page.locator("body").innerText()).toLowerCase();
    record(
      "Settings guarda sin error",
      !saveDisabledBefore && saveSucceeded,
      saveDisabledBefore ? "botón deshabilitado" : settingsText.slice(-160),
    );

    record("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    await page.screenshot({ path: `${SHOT_DIR}/admin-settings.png`, fullPage: true });
  } finally {
    await browser.close();
    await pool.query("delete from driver_earnings where order_id = $1", [settlementOrder.id]).catch(() => {});
    await pool.query("delete from orders where id = $1", [settlementOrder.id]).catch(() => {});
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("E2E ADMIN FAILED:", error);
  process.exitCode = 1;
});