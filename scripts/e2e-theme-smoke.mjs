import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DRIVER_PHONE = process.env.E2E_DRIVER_PHONE || "0991234567";
const DRIVER_PASSWORD = process.env.E2E_DRIVER_PASSWORD || "moto123";
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;
const SHOT_DIR = "test-flow-screenshots/rapidy-theme";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page, kind) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  if (kind === "driver") {
    await page.getByRole("button", { name: /Celular \(Repartidor\)/i }).click();
    await page.locator('input[type="tel"]').fill(DRIVER_PHONE);
    await page.locator('input[type="password"]').fill(DRIVER_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/driver", null, { timeout: 20_000 });
  } else {
    await page.getByRole("button", { name: /Email \(Admin/i }).click().catch(() => {});
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/admin", null, { timeout: 20_000 });
  }
}

async function checkRoute(page, route, label, options = {}) {
  const failedRequests = [];
  const pageErrors = [];
  const onResponse = (response) => {
    if (
      response.status() === 401 &&
      /commerce\.me|order\.getCommerceOrders/.test(response.url())
    ) {
      failedRequests.push(response.url());
    }
  };
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);

  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const beforeDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  const toggle = page.getByRole("button", { name: /Cambiar a modo/i }).first();
  const hasToggle = (await toggle.count()) > 0;

  // Normaliza a claro para capturar ambos temas en todas las rutas.
  if (hasToggle && beforeDark) {
    await toggle.click();
    await page.waitForTimeout(500);
  }
  const lightDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.screenshot({
    path: `${SHOT_DIR}/${label}-light.png`,
    fullPage: false,
  });

  if (hasToggle) {
    await toggle.click();
    await page.waitForTimeout(500);
  }
  const afterDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  const toggled = hasToggle && !lightDark && afterDark;

  const body = (await page.locator("body").innerText()).toLowerCase();
  const routeOk = page.url().endsWith(route) && body.length > 30;

  let mapInfo = null;
  if (options.map) {
    mapInfo = await page.evaluate(() => {
      const el = document.getElementById("driver-map");
      if (!el) return { exists: false };
      return {
        exists: true,
        width: el.offsetWidth,
        height: el.offsetHeight,
        tiles: el.querySelectorAll("img.leaflet-tile").length,
        markers: el.querySelectorAll(".leaflet-marker-icon").length,
      };
    });
  }

  await page.screenshot({
    path: `${SHOT_DIR}/${label}-${afterDark ? "dark" : "light"}.png`,
    fullPage: false,
  });
  if (hasToggle) {
    await toggle.click();
    await page.waitForTimeout(300);
  }

  page.off("response", onResponse);
  page.off("pageerror", onPageError);

  record(`Ruta ${route}`, routeOk, page.url());
  record(`Tema ${route}`, hasToggle && toggled, hasToggle ? `${beforeDark}->${afterDark}` : "sin ThemeToggle");
  record(`Sin 401 merchant en ${route}`, failedRequests.length === 0, failedRequests.slice(0, 2).join(" | "));
  record(`Sin errores de página ${route}`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  if (options.map) {
    record(
      `Mapa visible ${route}`,
      Boolean(mapInfo?.exists && mapInfo.width > 0 && mapInfo.height > 0 && mapInfo.tiles > 0),
      JSON.stringify(mapInfo),
    );
    record(
      `Mapa con marcadores ${route}`,
      Boolean(mapInfo?.markers > 0),
      String(mapInfo?.markers ?? 0),
    );
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.");
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page, "driver");
    const driverRoutes = [
      ["/driver", "driver-home"],
      ["/driver/order/5", "driver-order"],
      ["/driver/earnings", "driver-earnings"],
      ["/driver/profile", "driver-profile"],
      ["/driver/history", "driver-history"],
      ["/driver/chat/5", "driver-chat"],
    ];
    for (const [route, label] of driverRoutes) {
      await checkRoute(page, route, label, { map: route === "/driver/order/5" });
    }

    await context.clearCookies();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await login(page, "admin");
    const adminRoutes = [
      ["/admin", "admin-dashboard"],
      ["/admin/commerces", "admin-commerces"],
      ["/admin/drivers", "admin-drivers"],
      ["/admin/orders", "admin-orders"],
      ["/admin/products", "admin-products"],
      ["/admin/settings", "admin-settings"],
    ];
    for (const [route, label] of adminRoutes) {
      await checkRoute(page, route, label);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("THEME E2E FAILED:", error);
  process.exitCode = 1;
});