#!/usr/bin/env node
/**
 * Smoke de accesibilidad y responsive — Frente 14.
 *
 * Recorre las 6 rutas de Admin y las 6 de Driver, en viewport móvil
 * (390x844) y escritorio (1280x900), y valida:
 *  - h1 visible o landmark <main>
 *  - botones con nombre accesible
 *  - inputs/textarea/select con label asociado
 *  - ausencia de overflow horizontal
 *  - targets de acciones >= 40x40 px
 *  - foco visible en controles interactivos
 *
 * Uso:
 *   node scripts/a11y-smoke.mjs
 *
 * Variables:
 *   E2E_BASE_URL            default http://localhost:3000
 *   ADMIN_EMAIL / ADMIN_PASSWORD   obligatorias (NO hardcodear)
 *   E2E_DRIVER_PHONE        default 0991234567
 *   E2E_DRIVER_PASSWORD     default moto123
 *   E2E_DRIVER_ORDER_ID     pedido asignado al driver (default 5)
 *   E2E_DRIVER_CHAT_ORDER_ID  pedido para el chat (default = order id)
 *   CHROME_PATH             ejecutable de Chromium
 *
 * No reinicia el servidor ni modifica datos. Sale con código 1 si hay fallos.
 */
import "dotenv/config";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DRIVER_PHONE = process.env.E2E_DRIVER_PHONE || "0991234567";
const DRIVER_PASSWORD = process.env.E2E_DRIVER_PASSWORD || "moto123";
const DRIVER_ORDER_ID = process.env.E2E_DRIVER_ORDER_ID || "5";
const DRIVER_CHAT_ORDER_ID =
  process.env.E2E_DRIVER_CHAT_ORDER_ID || DRIVER_ORDER_ID;
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

const ROUTES = [
  { area: "admin", path: "/admin", label: "admin-dashboard" },
  { area: "admin", path: "/admin/commerces", label: "admin-commerces" },
  { area: "admin", path: "/admin/drivers", label: "admin-drivers" },
  { area: "admin", path: "/admin/orders", label: "admin-orders" },
  { area: "admin", path: "/admin/products", label: "admin-products" },
  { area: "admin", path: "/admin/settings", label: "admin-settings" },
  { area: "driver", path: "/driver", label: "driver-home" },
  {
    area: "driver",
    path: `/driver/order/${DRIVER_ORDER_ID}`,
    label: "driver-order",
  },
  { area: "driver", path: "/driver/earnings", label: "driver-earnings" },
  { area: "driver", path: "/driver/profile", label: "driver-profile" },
  { area: "driver", path: "/driver/history", label: "driver-history" },
  {
    area: "driver",
    path: `/driver/chat/${DRIVER_CHAT_ORDER_ID}`,
    label: "driver-chat",
  },
];

const results = [];
const warnings = [];
const routeSummaries = [];

function record(route, viewport, check, ok, detail = "") {
  results.push({ route, viewport, check, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"} [${viewport}] ${route} · ${check}${detail ? ` — ${detail}` : ""}`
  );
}

function warn(route, viewport, check, detail = "") {
  warnings.push({ route, viewport, check, detail });
  console.log(
    `WARN [${viewport}] ${route} · ${check}${detail ? ` — ${detail}` : ""}`
  );
}

function truncateList(items, max = 5) {
  const shown = items.slice(0, max).join(" | ");
  return items.length > max ? `${shown} | (+${items.length - max} más)` : shown;
}

async function login(page, kind) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  if (kind === "driver") {
    await page.getByRole("button", { name: /Celular \(Repartidor\)/i }).click();
    await page.locator('input[type="tel"]').fill(DRIVER_PHONE);
    await page.locator('input[type="password"]').fill(DRIVER_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/driver", null, {
      timeout: 20_000,
    });
  } else {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno (usar .env, no hardcodear)."
      );
    }
    await page
      .getByRole("button", { name: /Email \(Admin/i })
      .click()
      .catch(() => {});
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Ingresar al Panel/i }).click();
    await page.waitForFunction(() => location.pathname === "/admin", null, {
      timeout: 20_000,
    });
  }
}

/**
 * Auditoría dentro del DOM. Devuelve hallazgos serializables.
 * Se ejecuta en el navegador: no referenciar variables de Node.
 */
function auditDom() {
  const normalize = value => (value || "").replace(/\s+/g, " ").trim();

  const isVisible = el => {
    if (!el || el.closest("[aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const textOf = el => normalize(el?.innerText || el?.textContent || "");

  const accessibleName = el => {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map(id => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(" ");
      if (text) return { name: text, source: "aria-labelledby" };
    }
    const ariaLabel = normalize(el.getAttribute("aria-label"));
    if (ariaLabel) return { name: ariaLabel, source: "aria-label" };
    if (el.tagName === "INPUT") {
      const value = normalize(el.value || el.getAttribute("value"));
      if (value) return { name: value, source: "value" };
    }
    const text = textOf(el);
    if (text) return { name: text, source: "text" };
    const imgAlt = normalize(el.querySelector("img[alt]")?.getAttribute("alt"));
    if (imgAlt) return { name: imgAlt, source: "img-alt" };
    const svgTitle = normalize(el.querySelector("svg title")?.textContent);
    if (svgTitle) return { name: svgTitle, source: "svg-title" };
    const title = normalize(el.getAttribute("title"));
    if (title) return { name: title, source: "title" };
    return { name: "", source: "none" };
  };

  const labelInfo = el => {
    const ariaLabel = normalize(el.getAttribute("aria-label"));
    if (ariaLabel) return { labelled: true, source: "aria-label" };
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map(id => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(" ");
      if (text) return { labelled: true, source: "aria-labelledby" };
    }
    if (el.labels && el.labels.length > 0) {
      const text = [...el.labels].map(textOf).filter(Boolean).join(" ");
      if (text) return { labelled: true, source: "label-for/wrapping" };
    }
    const wrapping = el.closest("label");
    if (wrapping && textOf(wrapping)) {
      return { labelled: true, source: "wrapping-label" };
    }
    if (normalize(el.getAttribute("title"))) {
      return { labelled: false, source: "title-only" };
    }
    return { labelled: false, source: "none" };
  };

  const describe = el => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = normalize(el.className).split(" ").slice(0, 2).join(".");
    const text = textOf(el).slice(0, 45);
    return `${tag}${id}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };

  const controls = [
    ...document.querySelectorAll(
      "button, [role='button'], input[type='button'], input[type='submit'], input[type='reset'], a[href^='tel:'], a[href^='mailto:']"
    ),
  ].filter(el => {
    if (!isVisible(el)) return false;
    // Widgets de desarrollo (TanStack Query Devtools) y marcadores del mapa:
    // se auditan aparte para no mezclar hallazgos de producto con tooling.
    if (el.closest(".tsqd-open-btn-container, .tsqd-transitions-container"))
      return false;
    if (el.classList.contains("leaflet-marker-icon")) return false;
    return true;
  });

  const unnamedButtons = [];
  const titleOnlyButtons = [];
  controls.forEach(el => {
    const { name, source } = accessibleName(el);
    if (!name) unnamedButtons.push(describe(el));
    else if (source === "title")
      titleOnlyButtons.push(`${describe(el)} (title)`);
  });

  const fields = [
    ...document.querySelectorAll("input, textarea, select"),
  ].filter(el => {
    if (!isVisible(el)) return false;
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "button", "submit", "reset"].includes(type)) return false;
    }
    return true;
  });
  const unlabelledFields = [];
  const placeholderOnly = [];
  fields.forEach(el => {
    const { labelled, source } = labelInfo(el);
    if (!labelled) {
      const describeField = `${describe(el)} (${source})`;
      unlabelledFields.push(describeField);
      if (normalize(el.getAttribute("placeholder")))
        placeholderOnly.push(describe(el));
    }
  });

  const h1s = [...document.querySelectorAll("h1")].filter(isVisible);
  const mains = [...document.querySelectorAll("main, [role='main']")].filter(
    isVisible
  );

  const markers = [...document.querySelectorAll(".leaflet-marker-icon")].filter(
    isVisible
  );
  const mapMarkers = markers.map(el => {
    const { name } = accessibleName(el);
    const rect = el.getBoundingClientRect();
    return {
      name,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      label: describe(el).slice(0, 80),
    };
  });

  const docWidth = document.documentElement.scrollWidth;
  const bodyWidth = document.body?.scrollWidth || 0;
  const viewportWidth = window.innerWidth;
  const overflow = Math.max(docWidth, bodyWidth) - viewportWidth;
  const overflowElements = [];
  if (overflow > 1) {
    const all = [...document.querySelectorAll("body *")].filter(isVisible);
    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        if (rect.width <= viewportWidth * 1.5 && rect.width > 0) {
          overflowElements.push(
            `${describe(el)} [${Math.round(rect.left)}..${Math.round(rect.right)}]`
          );
        }
      }
    });
  }

  const smallTargets = [];
  controls.forEach(el => {
    if (el.disabled) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) {
      const { name } = accessibleName(el);
      smallTargets.push(
        `${name || describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
      );
    }
  });

  return {
    h1Count: h1s.length,
    mainCount: mains.length,
    h1Text: h1s.map(textOf).slice(0, 3),
    mapMarkerCount: mapMarkers.length,
    mapMarkers,
    buttonCount: controls.length,
    unnamedButtons,
    titleOnlyButtons,
    fieldCount: fields.length,
    unlabelledFields,
    placeholderOnly,
    docWidth,
    bodyWidth,
    viewportWidth,
    overflow,
    overflowElements,
    smallTargets,
  };
}

/**
 * Comprueba foco visible comparando estilos antes/después de focus().
 * Usa focus({ focusVisible: true }) para activar :focus-visible en Chromium.
 */
function auditFocus() {
  const isVisible = el => {
    if (!el || el.closest("[aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const textOf = el => (el?.innerText || "").replace(/\s+/g, " ").trim();
  const controls = [
    ...document.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
    ),
  ].filter(
    el =>
      isVisible(el) &&
      !el.disabled &&
      el.tabIndex >= 0 &&
      !el.closest(".tsqd-open-btn-container, .tsqd-transitions-container")
  );

  const snapshot = el => {
    const s = getComputedStyle(el);
    return [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.boxShadow,
      s.borderTopColor,
      s.borderTopWidth,
      s.backgroundColor,
      s.color,
      s.textDecorationLine,
    ].join("|");
  };

  const missing = [];
  let checked = 0;
  for (const el of controls.slice(0, 40)) {
    el.blur();
    const before = snapshot(el);
    el.focus({ focusVisible: true });
    const after = snapshot(el);
    const focusVisible = el.matches(":focus-visible");
    el.blur();
    checked += 1;
    if (!focusVisible || before === after) {
      const tag = el.tagName.toLowerCase();
      const name =
        textOf(el) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.id ||
        el.className.toString().split(" ")[0];
      missing.push(
        `${tag} "${String(name).slice(0, 40)}"${focusVisible ? " (sin cambio visual)" : " (sin :focus-visible)"}`
      );
    }
  }
  return { checked, missing };
}

/**
 * La app corre en Vite dev y otros frentes pueden guardar archivos durante
 * este smoke (HMR recarga la página). Reintentamos ante contextos destruidos.
 */
async function evaluateSafe(page, fn) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.evaluate(fn);
    } catch (error) {
      const retriable = /Execution context was destroyed|navigation/i.test(
        String(error?.message || error)
      );
      if (!retriable || attempt === 3) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(900);
    }
  }
  return undefined;
}

async function gotoRoute(page, routePath) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(`${BASE_URL}${routePath}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .waitForSelector("h1, main, [role='main']", { timeout: 15_000 })
        .catch(() => {});
      await page.waitForTimeout(3000);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(800);
    }
  }
}

async function auditRoute(page, route, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.waitForTimeout(250);
  await gotoRoute(page, route.path);

  const landed = new URL(page.url()).pathname;
  if (landed !== route.path) {
    record(
      route.path,
      viewport.name,
      "Ruta accesible",
      false,
      `redirigió a ${landed}`
    );
    return;
  }
  record(route.path, viewport.name, "Ruta accesible", true, landed);

  const data = await evaluateSafe(page, auditDom);
  const landmarkOk = data.h1Count > 0 || data.mainCount > 0;
  record(
    route.path,
    viewport.name,
    "h1 / landmark principal",
    landmarkOk,
    `h1=${data.h1Count} main=${data.mainCount}${data.h1Text[0] ? ` h1="${data.h1Text[0]}"` : ""}`
  );

  record(
    route.path,
    viewport.name,
    "Botones con nombre accesible",
    data.unnamedButtons.length === 0,
    data.unnamedButtons.length === 0
      ? `${data.buttonCount} botones`
      : `${data.unnamedButtons.length}/${data.buttonCount}: ${truncateList(data.unnamedButtons)}`
  );
  if (data.titleOnlyButtons.length > 0) {
    warn(
      route.path,
      viewport.name,
      "Nombre accesible solo por title",
      truncateList(data.titleOnlyButtons)
    );
  }

  record(
    route.path,
    viewport.name,
    "Inputs con label asociado",
    data.unlabelledFields.length === 0,
    data.unlabelledFields.length === 0
      ? `${data.fieldCount} campos`
      : `${data.unlabelledFields.length}/${data.fieldCount}: ${truncateList(data.unlabelledFields)}`
  );
  if (data.placeholderOnly.length > 0) {
    warn(
      route.path,
      viewport.name,
      "Placeholder no cuenta como label",
      truncateList(data.placeholderOnly)
    );
  }

  if (data.mapMarkerCount > 0) {
    const unnamed = data.mapMarkers.filter(marker => !marker.name);
    const undersized = data.mapMarkers.filter(
      marker => marker.width < 40 || marker.height < 40
    );
    record(
      route.path,
      viewport.name,
      "Mapa: marcadores accesibles",
      unnamed.length === 0,
      `${data.mapMarkerCount} marcadores · sin nombre=${unnamed.length} · <40px=${undersized.length}${
        unnamed.length
          ? ` · ${truncateList(
              unnamed.map(
                marker => `${marker.label} ${marker.width}x${marker.height}`
              ),
              3
            )}`
          : ""
      }`
    );
  }

  record(
    route.path,
    viewport.name,
    "Sin overflow horizontal",
    data.overflow <= 1,
    `scrollWidth=${Math.max(data.docWidth, data.bodyWidth)} viewport=${data.viewportWidth} exceso=${data.overflow}px${
      data.overflowElements.length
        ? ` · ${truncateList(data.overflowElements, 3)}`
        : ""
    }`
  );

  record(
    route.path,
    viewport.name,
    "Targets >= 40x40 en acciones",
    data.smallTargets.length === 0,
    data.smallTargets.length === 0
      ? `${data.buttonCount} acciones`
      : `${data.smallTargets.length}/${data.buttonCount}: ${truncateList(data.smallTargets)}`
  );

  const focus = await evaluateSafe(page, auditFocus);
  record(
    route.path,
    viewport.name,
    "Foco visible",
    focus.missing.length === 0,
    focus.missing.length === 0
      ? `${focus.checked} controles`
      : `${focus.missing.length}/${focus.checked}: ${truncateList(focus.missing)}`
  );

  // Prueba de teclado: Tab debe mover el foco y no quedar atrapado en el body.
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  const tabStops = [];
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(
        el.getAttribute("aria-label") ||
        el.innerText ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 30)}"`;
    });
    if (!stop) break;
    if (/Tanstack/i.test(stop)) continue;
    if (!tabStops.includes(stop)) tabStops.push(stop);
    if (tabStops.length >= 8) break;
  }
  record(
    route.path,
    viewport.name,
    "Recorrido con Tab",
    tabStops.length >= 3,
    tabStops.length >= 3
      ? `${tabStops.length} paradas`
      : truncateList(tabStops, 8) || "sin paradas"
  );

  return data;
}

async function main() {
  console.log(`A11Y SMOKE ${BASE_URL}`);
  console.log(`Driver order=${DRIVER_ORDER_ID} chat=${DRIVER_CHAT_ORDER_ID}\n`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await login(page, "driver");
    for (const route of ROUTES.filter(item => item.area === "driver")) {
      for (const viewport of VIEWPORTS) {
        await auditRoute(page, route, viewport);
      }
    }

    await context.clearCookies();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await login(page, "admin");
    for (const route of ROUTES.filter(item => item.area === "admin")) {
      for (const viewport of VIEWPORTS) {
        await auditRoute(page, route, viewport);
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter(item => !item.ok);
  const routes = [...new Set(results.map(item => item.route))];
  for (const route of routes) {
    const routeResults = results.filter(item => item.route === route);
    const routeFailed = routeResults.filter(item => !item.ok);
    routeSummaries.push({
      route,
      total: routeResults.length,
      failed: routeFailed.length,
      checks: [...new Set(routeFailed.map(item => item.check))],
    });
  }

  console.log("\nRESUMEN POR RUTA");
  for (const summary of routeSummaries) {
    console.log(
      `${summary.failed === 0 ? "OK  " : "FAIL"} ${summary.route} — ${
        summary.failed === 0
          ? "sin hallazgos"
          : `${summary.failed} fallo(s): ${summary.checks.join(", ")}`
      }`
    );
  }
  console.log(
    `\nRESULT ${results.length - failed.length}/${results.length} PASS`
  );
  if (warnings.length > 0) {
    console.log(
      `WARN ${warnings.length} aviso(s) no bloqueantes (title-only, placeholder)`
    );
  }
  if (pageErrors.length > 0) {
    console.log(
      `Errores de página: ${pageErrors.length} · ${truncateList(pageErrors, 3)}`
    );
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error("A11Y SMOKE FAILED:", error);
  process.exitCode = 1;
});
