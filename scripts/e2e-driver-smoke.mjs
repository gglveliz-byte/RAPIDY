import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const DRIVER_PHONE = process.env.E2E_DRIVER_PHONE || "0991234567";
const DRIVER_PASSWORD = process.env.E2E_DRIVER_PASSWORD || "moto123";
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;
const SHOT_DIR = "test-flow-screenshots/rapidy-driver";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const product = (
    await pool.query(
      "select id, name, price from products where commerce_id = 1 order by id limit 1",
    )
  ).rows[0];
  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];
  const chatOrder = (
    await pool.query(
      `insert into orders
        (customer_id, driver_id, status, subtotal, delivery_fee, commission, total, payment_method, delivery_address, customer_phone)
       values ($1, 1, 'on_the_way', '10.00', '2.50', '1.00', '12.50', 'cash', 'Dirección chat driver', '0999999999')
       returning id`,
      [customer.id],
    )
  ).rows[0];
  await pool.query(
    `insert into order_items
      (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
     values ($1, $2, 1, $3, '1', $4, '10.00')`,
    [chatOrder.id, product.id, product.name, product.price],
  );
  await pool.query(
    `insert into order_commerce_status (order_id, commerce_id, status)
     values ($1, 1, 'picked_up')`,
    [chatOrder.id],
  );

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Celular \(Repartidor\)/i }).click();
    await page.locator('input[type="tel"]').fill(DRIVER_PHONE);
    await page.locator('input[type="password"]').fill(DRIVER_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/driver", null, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    record("Login driver", true, page.url());

    const homeText = (await page.locator("body").innerText()).toLowerCase();
    record(
      "Home driver carga",
      homeText.includes("pedidos disponibles") && homeText.includes("cerca de ti"),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    record("Sesión driver sobrevive reload", page.url().endsWith("/driver"), page.url());

    const routes = [
      ["/driver/earnings", "ganancias"],
      ["/driver/profile", "telefono"],
      ["/driver/history", "historial"],
      [`/driver/chat/${chatOrder.id}`, `pedido #${chatOrder.id}`],
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

    record("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await pool.query("delete from orders where id = $1", [chatOrder.id]).catch(() => {});
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("E2E DRIVER FAILED:", error);
  process.exitCode = 1;
});