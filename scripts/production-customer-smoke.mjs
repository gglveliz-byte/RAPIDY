import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import pg from "pg";
import { chromium } from "playwright-core";

/**
 * E2E de producción — journey Cliente (navegador real).
 *
 * Recorre: login OTP -> home -> búsqueda -> tienda -> carrito -> quote ->
 * checkout -> creación de pedido -> tracking -> chat -> cancelación -> perfil
 * -> logout. Usa un cliente y un producto existentes; crea un único pedido y lo
 * elimina al final junto con su chat y los OTP del teléfono de prueba.
 *
 * No reinicia el servidor ni ejecuta migraciones. Requiere autorización
 * explícita para escribir contra un host remoto:
 *   E2E_CUSTOMER_ALLOW_WRITES=1
 *
 * Uso:
 *   node scripts/production-customer-smoke.mjs
 *
 * Variables:
 *   E2E_BASE_URL                  default http://localhost:3000
 *   E2E_CUSTOMER_PHONE            cliente existente (Ecuador, +593...)
 *   E2E_CUSTOMER_ALLOW_WRITES     obligatorio en host remoto (=1)
 *   E2E_OTP_CODE                  código del OTP solicitado en esta corrida
 *   E2E_PRODUCT_ID                producto unitario opcional; si falta se elige
 *   E2E_DELIVERY_ADDRESS          dirección base para el pedido de prueba
 *   E2E_MAX_QTY                   máximo de unidades para superar el mínimo
 *   E2E_HEADED=1                  navegador visible
 *   E2E_IGNORE_HTTPS_ERRORS=1     aceptar certificado no confiable
 *   E2E_CUSTOMER_SCREENSHOTS=1    guardar capturas de evidencia
 *   CHROME_PATH                   ejecutable de Chrome/Chromium
 *   DATABASE_URL                  misma base que usa el servidor
 */

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const IS_LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(BASE_URL);
const ALLOW_WRITES = IS_LOCAL || process.env.E2E_CUSTOMER_ALLOW_WRITES === "1";
const CUSTOMER_PHONE = process.env.E2E_CUSTOMER_PHONE || "+593 99 123 4567";
const OTP_CODE = (process.env.E2E_OTP_CODE || "").trim();
const PRODUCT_ID = process.env.E2E_PRODUCT_ID ? Number(process.env.E2E_PRODUCT_ID) : null;
const BASE_ADDRESS =
  process.env.E2E_DELIVERY_ADDRESS || "Av. Amazonas y Naciones Unidas, Quito";
const MAX_QTY = Number(process.env.E2E_MAX_QTY || 12);
const HEADLESS = process.env.E2E_HEADED !== "1";
const IGNORE_HTTPS = process.env.E2E_IGNORE_HTTPS_ERRORS === "1";
const SCREENSHOTS = process.env.E2E_CUSTOMER_SCREENSHOTS === "1";
const SHOT_DIR = path.join("test-flow-screenshots", "customer-production");

const RUN_TAG = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const DELIVERY_ADDRESS = `E2E Rapidy ${RUN_TAG} - ${BASE_ADDRESS}`;
const CHAT_MESSAGE = `Mensaje E2E cliente ${RUN_TAG}`;
const CANCEL_REASON = `Cancelado por E2E ${RUN_TAG}`;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function closeTo(actual, expected, epsilon = 0.005) {
  return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}
function money(value) {
  return Number(value).toFixed(2);
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhone(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `593${digits}`;
  else if (digits.startsWith("0")) digits = `593${digits.slice(1)}`;
  return digits;
}
const CUSTOMER_DIGITS = normalizePhone(CUSTOMER_PHONE);

function resolveChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const root = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : null;
  if (root && fs.existsSync(root)) {
    const dirs = fs
      .readdirSync(root)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort()
      .reverse();
    for (const dir of dirs) {
      const candidate = path.join(root, dir, "chrome-win64", "chrome.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    "No encontré Chrome/Chromium. Define CHROME_PATH o instala playwright-core + Chromium.",
  );
}

function unwrapTrpc(json) {
  const first = Array.isArray(json) ? json[0] : json;
  const data = first?.result?.data;
  if (data && typeof data === "object" && "json" in data) return data.json;
  return data ?? null;
}
function trpcError(json) {
  const first = Array.isArray(json) ? json[0] : json;
  return (
    first?.error?.json?.message ||
    first?.error?.message ||
    first?.message ||
    ""
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitUntil(fn, timeout, label) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(
    `Timeout esperando ${label} (${timeout} ms)${lastError ? `: ${lastError.message}` : ""}`,
  );
}
async function waitForTextIn(container, texts, timeout = 15000) {
  return waitUntil(
    async () => {
      const body = await container.innerText().catch(() => "");
      const normalized = body.toLowerCase();
      return texts.some((text) => normalized.includes(text.toLowerCase()));
    },
    timeout,
    `texto: ${texts.join(" | ")}`,
  ).then(() => true);
}
async function waitForAnyText(page, texts, timeout = 15000) {
  return waitForTextIn(page.locator("body"), texts, timeout);
}
async function readCart(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("cart");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        ts: parsed.ts ?? null,
      };
    } catch {
      return null;
    }
  });
}
function cartQuantity(cart, productId) {
  const item = cart?.items?.find((entry) => Number(entry.productId) === Number(productId));
  return item ? Number(item.quantity) : 0;
}

async function loadFixtures(pool) {
  const customerRows = await pool.query(
    `select id, first_name, last_name, phone, address
       from customers
      where deleted_at is null
        and regexp_replace(phone, '[^0-9]', '', 'g') = $1
      limit 2`,
    [CUSTOMER_DIGITS],
  );
  if (customerRows.rows.length === 0) {
    throw new Error(
      `No existe un cliente con el teléfono ${CUSTOMER_PHONE}. ` +
        "Regístralo una vez en /register; este E2E no crea clientes.",
    );
  }
  if (customerRows.rows.length > 1) {
    throw new Error(`Hay más de un cliente para el teléfono ${CUSTOMER_PHONE}.`);
  }
  const customer = customerRows.rows[0];

  const settingsRows = await pool.query(
    `select key, value from app_settings
      where key in ('delivery_fee', 'min_order_amount')`,
  );
  const settings = new Map(settingsRows.rows.map((row) => [row.key, row.value]));
  const deliveryFee = Number(settings.get("delivery_fee") ?? "2.50");
  const minOrder = Number(settings.get("min_order_amount") ?? "5.00");
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
    throw new Error("app_settings.delivery_fee inválido.");
  }
  if (!Number.isFinite(minOrder) || minOrder < 0) {
    throw new Error("app_settings.min_order_amount inválido.");
  }

  const productRows = await pool.query(
    `select p.id,
            p.name,
            p.price::text as price,
            p.unit_type,
            c.id as commerce_id,
            c.name as commerce_name,
            c.min_order::text as min_order,
            c.commission_rate::text as commission_rate
       from products p
       join commerces c on c.id = p.commerce_id
      where c.status = 'active'
        and c.is_open = 'open'
        and p.is_available = 'yes'
        and p.admin_paused = false
        and p.unit_type = 'unit'
        and p.price::numeric > 0
      order by p.price::numeric asc, p.id asc
      limit 100`,
  );

  const candidates = [];
  for (const row of productRows.rows) {
    if (PRODUCT_ID && Number(row.id) !== PRODUCT_ID) continue;
    const price = Number(row.price);
    const commerceMin = Number(row.min_order);
    const required = Math.max(minOrder, commerceMin);
    if (!(price > 0) || !(required > 0) || price >= required) continue;
    const quantity = Math.ceil((required + 0.001) / price);
    if (quantity < 2 || quantity > MAX_QTY) continue;
    candidates.push({
      id: Number(row.id),
      name: row.name,
      price,
      unitType: row.unit_type,
      commerceId: Number(row.commerce_id),
      commerceName: row.commerce_name,
      commerceMin,
      commerceMinRaw: row.min_order,
      commissionRate: Number(row.commission_rate || 10),
      quantity,
      requiredSubtotal: required,
    });
  }

  if (candidates.length === 0) {
    throw new Error(
      PRODUCT_ID
        ? `El producto E2E_PRODUCT_ID=${PRODUCT_ID} no permite probar mínimos ` +
            `(debe ser unitario, disponible, de comercio abierto y con precio menor al mínimo).`
        : `No hay producto unitario que permita probar el mínimo con 1 unidad y ` +
            `superarlo con <= ${MAX_QTY} unidades. Revisa productos/mínimos o define E2E_PRODUCT_ID.`,
    );
  }
  // Preferir comercio con mínimo propio para validar el mensaje por comercio.
  candidates.sort((a, b) => {
    const aCommerce = a.commerceMin > 0 ? 0 : 1;
    const bCommerce = b.commerceMin > 0 ? 0 : 1;
    if (aCommerce !== bCommerce) return aCommerce - bCommerce;
    return a.quantity - b.quantity || a.price - b.price;
  });
  const product = candidates[0];

  return { customer, deliveryFee, minOrder, product };
}

async function cleanupDatabase(pool, state) {
  const summary = { orders: 0, chat: 0, items: 0, history: 0, otp: 0, deleted: 0, deletedOtp: 0 };
  if (!pool) return summary;

  let orderCleanupError = null;
  try {
    const ids = new Set(state.orderIds);
    if (state.fixtures?.customer?.id && state.startedAt) {
      // Red de seguridad: el pedido de prueba lleva una dirección única por corrida.
      const signature = await pool.query(
        `select id from orders
          where customer_id = $1
            and delivery_address = $2
            and created_at >= $3`,
        [state.fixtures.customer.id, DELIVERY_ADDRESS, state.startedAt],
      );
      for (const row of signature.rows) ids.add(Number(row.id));
    }
    const orderIds = [...ids];

    if (orderIds.length > 0) {
      const deleted = await pool.query(
        `delete from orders
          where id = any($1::int[])
            and customer_id = $2
            and created_at >= $3
            and driver_id is null
          returning id`,
        [orderIds, state.fixtures.customer.id, state.startedAt],
      );
      summary.deleted = deleted.rowCount;

      const [leftOrders, leftChat, leftItems, leftHistory] = await Promise.all([
        pool.query(
          `select id from orders
            where id = any($1::int[])
               or (customer_id = $2 and delivery_address = $3 and created_at >= $4)`,
          [orderIds, state.fixtures.customer.id, DELIVERY_ADDRESS, state.startedAt],
        ),
        pool.query("select count(*)::int as n from chat_messages where order_id = any($1::int[])", [
          orderIds,
        ]),
        pool.query("select count(*)::int as n from order_items where order_id = any($1::int[])", [
          orderIds,
        ]),
        pool.query(
          "select count(*)::int as n from order_status_history where order_id = any($1::int[])",
          [orderIds],
        ),
      ]);
      summary.orders = leftOrders.rows.length;
      summary.chat = leftChat.rows[0].n;
      summary.items = leftItems.rows[0].n;
      summary.history = leftHistory.rows[0].n;

      if (leftOrders.rows.length > 0) {
        throw new Error(
          `Limpieza incompleta: quedan pedidos ${leftOrders.rows
            .map((row) => row.id)
            .join(", ")}. Puede haber driver asignado o datos fuera de la firma.`,
        );
      }
    }
  } catch (error) {
    orderCleanupError = error;
  } finally {
    if (CUSTOMER_DIGITS) {
      const otp = await pool.query(
        "delete from otp_verifications where phone = $1 and created_at >= $2 returning id",
        [CUSTOMER_DIGITS, state.startedAt],
      );
      summary.deletedOtp = otp.rowCount;
      const leftOtp = await pool.query(
        "select count(*)::int as n from otp_verifications where phone = $1 and created_at >= $2",
        [CUSTOMER_DIGITS, state.startedAt],
      );
      summary.otp = leftOtp.rows[0].n;
    }
  }

  if (orderCleanupError) summary.error = orderCleanupError.message;
  return summary;
}

async function getOtpCode(page, otpPayload) {
  if (OTP_CODE) return { code: OTP_CODE, source: "E2E_OTP_CODE" };
  if (otpPayload?.devCode) return { code: String(otpPayload.devCode), source: "devCode" };

  const body = await page.locator("body").innerText().catch(() => "");
  const match = body.match(/tu código es\s*(\d{4,8})/i);
  if (match) return { code: match[1], source: "UI devCode" };

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question("Código OTP recibido por WhatsApp: ")).trim();
      assert(/^\d{4,8}$/.test(answer), "El OTP debe tener entre 4 y 8 dígitos.");
      return { code: answer, source: "entrada interactiva" };
    } finally {
      rl.close();
    }
  }

  throw new Error(
    "No hay código OTP disponible. Define E2E_OTP_CODE (código de esta corrida), " +
      "usa OTP_DEV_FALLBACK=true en local o ejecuta en una terminal interactiva.",
  );
}

async function main() {
  assert(ALLOW_WRITES, "Host remoto: define E2E_CUSTOMER_ALLOW_WRITES=1 para autorizar escrituras.");
  assert(process.env.DATABASE_URL, "Define DATABASE_URL (misma base que usa el servidor).");
  assert(CUSTOMER_DIGITS.startsWith("593") && CUSTOMER_DIGITS.length >= 11,
    "E2E_CUSTOMER_PHONE debe ser un celular de Ecuador con prefijo +593.");
  assert(MAX_QTY >= 2 && MAX_QTY <= 50, "E2E_MAX_QTY debe estar entre 2 y 50.");

  const startedAt = new Date();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const state = { startedAt, fixtures: null, orderIds: [] };
  let browser = null;
  let context = null;
  let page = null;
  let authenticated = false;
  let cleanupSummary = null;
  let cleanupError = null;
  let fatalError = null;

  try {
    state.fixtures = await loadFixtures(pool);
    const { customer, deliveryFee, minOrder, product } = state.fixtures;

    // El teléfono debe ser exclusivo de pruebas: limpia OTP previos para evitar
    // el rate limit de 45 s entre envíos y deja el entorno listo.
    await pool.query("delete from otp_verifications where phone = $1", [CUSTOMER_DIGITS]);

    console.log(
      `SETUP customer=${customer.id} phone=${CUSTOMER_DIGITS} ` +
        `commerce=${product.commerceId} product=${product.id} ` +
        `price=${money(product.price)} min=${money(product.requiredSubtotal)} qty=${product.quantity}`,
    );
    console.log(`ADDRESS ${DELIVERY_ADDRESS}`);

    browser = await chromium.launch({
      executablePath: resolveChrome(),
      headless: HEADLESS,
      args: IGNORE_HTTPS ? ["--ignore-certificate-errors"] : [],
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: IGNORE_HTTPS,
    });
    page = await context.newPage();

    const pageErrors = [];
    const apiErrors = [];
    const quotes = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      const url = message.location()?.url || "";
      const combined = `${text} ${url}`.toLowerCase();
      if (
        combined.includes("favicon") ||
        combined.includes("manifest") ||
        combined.includes("eventsource") ||
        combined.includes("/api/events/") ||
        combined.includes("resizeobserver loop") ||
        (combined.includes("failed to load resource") && combined.includes("net::err_aborted"))
      ) {
        return;
      }
      pageErrors.push(`${text}${url ? ` (${url})` : ""}`);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (!url.includes("/api/")) return;
      if (response.status() >= 500) {
        apiErrors.push(`${response.status()} ${url}`);
      }
      if (authenticated && (response.status() === 401 || response.status() === 403)) {
        apiErrors.push(`${response.status()} ${url}`);
      }
      if (url.includes("/api/trpc/order.quote")) {
        response
          .json()
          .then((json) => {
            const quote = unwrapTrpc(json);
            if (quote?.lines) quotes.push(quote);
          })
          .catch(() => {});
      }
    });

    const shot = async (name) => {
      if (!SCREENSHOTS) return;
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
    };

    // ── 1. Login OTP ────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/customer-login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="tel"]').waitFor({ timeout: 20000 });

    // Error inline sin llamada de red.
    await page.getByRole("button", { name: /Enviar código/i }).click();
    await page.getByText("Por favor ingresa tu número de celular", { exact: true }).waitFor({
      timeout: 5000,
    });
    record("Login valida teléfono vacío", true);

    const localNumber = CUSTOMER_DIGITS.slice(3);
    await page.locator('input[type="tel"]').fill(localNumber);
    const otpResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/customer.requestOtp") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await page.getByRole("button", { name: /Enviar código/i }).click();
    const otpResponse = await otpResponsePromise;
    assert(otpResponse, "No hubo respuesta de customer.requestOtp (timeout).");
    const otpJson = await otpResponse.json().catch(() => null);
    const otpData = unwrapTrpc(otpJson);
    assert(
      otpResponse.ok() && otpData?.success,
      `requestOtp falló (${otpResponse.status()}): ${trpcError(otpJson)}`,
    );
    await page.locator('input[aria-label="Código de verificación"]').waitFor({ timeout: 20000 });
    const otp = await getOtpCode(page, otpData);
    record("OTP solicitado", true, otp.source);

    const verifyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/customer.verifyOtp") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await page.locator('input[aria-label="Código de verificación"]').fill(otp.code);
    await page.getByRole("button", { name: /Verificar y entrar/i }).click();
    const verifyResponse = await verifyResponsePromise;
    assert(verifyResponse, "No hubo respuesta de customer.verifyOtp (timeout).");
    const verifyJson = await verifyResponse.json().catch(() => null);
    const verifyData = unwrapTrpc(verifyJson);
    assert(
      verifyResponse.ok() && verifyData?.customer,
      `verifyOtp falló (${verifyResponse.status()}): ${trpcError(verifyJson)}`,
    );
    assert(
      verifyData.isNew === false,
      "El teléfono no tiene cuenta: este E2E exige un cliente registrado.",
    );
    assert(
      Number(verifyData.customer.id) === Number(customer.id),
      "El cliente autenticado no coincide con el cliente de DATABASE_URL. " +
        "Servidor y base apuntan a entornos distintos.",
    );
    await page.waitForURL("**/home", { timeout: 30000 });
    await page.getByText("Todos los Comercios").first().waitFor({ timeout: 30000 });
    authenticated = true;
    record("Login OTP + /home", true, `cliente=${customer.id}`);

    // ── 2. Sesión y cookies ─────────────────────────────────────────────────
    const cookies = await context.cookies(BASE_URL);
    const accessCookie = cookies.find((cookie) => cookie.name === "quickgo_token");
    const refreshCookie = cookies.find((cookie) => cookie.name === "refresh_token");
    assert(accessCookie?.httpOnly, "Falta la cookie HttpOnly quickgo_token.");
    assert(refreshCookie?.httpOnly, "Falta la cookie HttpOnly refresh_token.");
    assert(
      String(accessCookie.sameSite).toLowerCase() === "lax",
      `SameSite de quickgo_token no es Lax: ${accessCookie.sameSite}`,
    );
    assert(
      String(refreshCookie.sameSite).toLowerCase() === "lax",
      `SameSite de refresh_token no es Lax: ${refreshCookie.sameSite}`,
    );
    if (BASE_URL.startsWith("https://")) {
      assert(accessCookie.secure && refreshCookie.secure, "En HTTPS las cookies deben ser Secure.");
    }
    record("Cookies HttpOnly + SameSite=Lax", true);

    const nowSeconds = Date.now() / 1000;
    assert(
      accessCookie.expires > nowSeconds + 5 * 60 &&
        accessCookie.expires < nowSeconds + 60 * 60,
      "La cookie de acceso no tiene vigencia ~15 min.",
    );
    assert(
      refreshCookie.expires > nowSeconds + 300 * 24 * 60 * 60,
      "La cookie refresh no tiene vigencia ~365 días.",
    );
    record("Vigencia access 15 min / refresh 365 días", true);

    const storage = await page.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage).map(([key, value]) => [key, String(value)])),
    );
    const tokenKeys = Object.keys(storage).filter((key) => /token|refresh|access/i.test(key));
    const jwtValues = Object.entries(storage).filter(([, value]) => value.includes("eyJhbGci"));
    assert(
      tokenKeys.length === 0 && jwtValues.length === 0,
      `Hay credenciales en localStorage: ${[...tokenKeys, ...jwtValues.map(([key]) => key)].join(", ")}`,
    );
    record("Sin tokens en localStorage", true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Todos los Comercios").first().waitFor({ timeout: 30000 });
    record("Sesión persiste tras reload", true);

    await page.goto(`${BASE_URL}/customer-login`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/home", { timeout: 15000 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/home", { timeout: 15000 });
    await page.getByText("Todos los Comercios").first().waitFor({ timeout: 30000 });
    record("Landing y login redirigen a /home con sesión", true);

    // ── 3. Home, búsqueda y tienda ──────────────────────────────────────────
    const homeText = await page.locator("body").innerText();
    assert(homeText.includes("Todos los Comercios"), "Home no cargó el catálogo.");
    assert(homeText.includes("Buscar en Rapidy...") || (await page.locator('input[placeholder="Buscar en Rapidy..."]').isVisible()),
      "Home no muestra el buscador.");
    record("Home carga catálogo y buscador", true);

    const homeSearch = page.locator('input[placeholder="Buscar en Rapidy..."]');
    await homeSearch.fill(product.name);
    await homeSearch.press("Enter");
    await page.waitForURL(/\/search\?q=/, { timeout: 20000 });
    const productCard = page.getByRole("button", {
      name: `${product.name} de ${product.commerceName}`,
      exact: true,
    });
    await productCard.waitFor({ timeout: 30000 });
    record("Búsqueda en /search encuentra el producto", true, product.name);

    await productCard.click();
    await page.waitForURL(`**/store/${product.commerceId}`, { timeout: 20000 });
    await page.getByRole("heading", { name: product.commerceName, exact: true }).waitFor({
      timeout: 30000,
    });
    await page.getByRole("heading", { name: product.name, exact: true }).first().waitFor({
      timeout: 30000,
    });
    record("Tienda carga comercio y producto", true, `comercio=${product.commerceId}`);

    if (product.commerceMin > 0) {
      const minimumText = await waitForAnyText(
        page,
        [`Pedido mínimo: $${product.commerceMinRaw} USD`],
        10000,
      );
      assert(minimumText, "La tienda no muestra el pedido mínimo configurado.");
      record("Tienda muestra el mínimo del comercio", true, `$${product.commerceMinRaw}`);
    }

    const productHeading = page
      .getByRole("heading", { name: product.name, exact: true })
      .first();
    const productRow = productHeading.locator(
      'xpath=ancestor::div[.//button[@aria-label="Agregar al carrito"]][1]',
    );
    await productRow.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.getByText("Ver mi pedido", { exact: true }).waitFor({ timeout: 10000 });
    const cartAfterAdd = await readCart(page);
    assert(
      cartQuantity(cartAfterAdd, product.id) === 1,
      "El carrito local no registró 1 unidad del producto.",
    );
    await page.getByRole("button", { name: /Ir a pagar/ }).click();
    await page.waitForURL("**/cart", { timeout: 20000 });
    await page.getByText("Mi Carrito", { exact: true }).waitFor({ timeout: 20000 });
    record("Tienda agrega al carrito y navega a /cart", true);

    // ── 4. Carrito: mínimo, quote y totales ─────────────────────────────────
    const initialQuote = await waitUntil(
      () =>
        quotes.find(
          (quote) =>
            quote.lines?.some(
              (line) => Number(line.productId) === product.id && Number(line.quantity) === 1,
            ) && quote.meetsMinOrder === false,
        ),
      30000,
      "quote inicial con mínimo incumplido",
    );
    assert(
      initialQuote.issues.some((issue) => /mínimo/i.test(issue)),
      "El quote inicial no reporta el mínimo.",
    );
    const initialIssueText = initialQuote.issues.join(" ").toLowerCase();
    if (product.commerceMin > 0) {
      assert(
        initialIssueText.includes("el mínimo de"),
        "El quote inicial no reporta el mínimo del comercio.",
      );
    }
    if (product.price < minOrder) {
      assert(
        initialIssueText.includes("pedido mínimo general"),
        "El quote inicial no reporta el mínimo general.",
      );
    }
    const minAlert = page.getByRole("alert").filter({ hasText: /mínimo/i }).first();
    await minAlert.waitFor({ timeout: 15000 });
    const blockedCta = page.getByRole("button", { name: /Revisa el carrito/ });
    await blockedCta.waitFor({ timeout: 15000 });
    assert(await blockedCta.isDisabled(), "El CTA de checkout no está bloqueado con el mínimo incumplido.");
    record(
      "Carrito detecta mínimo y bloquea checkout",
      true,
      initialQuote.issues[0],
    );

    const cartItem = page
      .getByRole("heading", { name: product.name, exact: true })
      .first()
      .locator('xpath=ancestor::div[.//button[@aria-label="Aumentar cantidad"]][1]');
    const plusButton = cartItem.getByRole("button", { name: "Aumentar cantidad" });
    for (let quantity = 1; quantity < product.quantity; quantity += 1) {
      await plusButton.click();
      await waitUntil(
        async () => cartQuantity(await readCart(page), product.id) === quantity + 1,
        5000,
        `cantidad ${quantity + 1} en carrito`,
      );
    }
    const readyCta = page.getByRole("button", { name: /Continuar con la entrega/ });
    await readyCta.waitFor({ timeout: 20000 });
    assert(await readyCta.isEnabled(), "El CTA no se habilitó al superar el mínimo.");
    await waitUntil(
      async () => (await page.getByRole("alert").filter({ hasText: /mínimo/i }).count()) === 0,
      15000,
      "desaparición de la alerta de mínimo",
    );
    record(
      "Carrito supera el mínimo y habilita checkout",
      true,
      `${product.quantity} x $${money(product.price)}`,
    );

    const quote = await waitUntil(
      () =>
        quotes.find(
          (item) =>
            item.meetsMinOrder === true &&
            item.issues?.length === 0 &&
            item.lines?.some(
              (line) =>
                Number(line.productId) === product.id &&
                Number(line.quantity) === product.quantity,
            ),
        ),
      30000,
      "quote autoritativo sin issues",
    );
    const expectedSubtotal = Number((product.price * product.quantity).toFixed(2));
    const expectedCommission = Number(
      ((expectedSubtotal * product.commissionRate) / 100).toFixed(2),
    );
    assert(closeTo(quote.subtotal, expectedSubtotal), `Subtotal ${quote.subtotal} != ${expectedSubtotal}`);
    assert(closeTo(quote.deliveryFee, deliveryFee), `Envío ${quote.deliveryFee} != ${deliveryFee}`);
    assert(closeTo(quote.total, expectedSubtotal + deliveryFee), "Total != subtotal + envío");
    assert(
      closeTo(quote.commission, expectedCommission),
      `Comisión ${quote.commission} != ${expectedCommission} (rate=${product.commissionRate})`,
    );
    assert(closeTo(quote.minOrder, minOrder), `minOrder ${quote.minOrder} != ${minOrder}`);
    assert(quote.issues.length === 0 && quote.meetsMinOrder === true, "El quote conserva issues.");
    record(
      "Quote autoritativo: subtotal + envío = total",
      true,
      `subtotal=$${money(quote.subtotal)} envío=$${money(quote.deliveryFee)} total=$${money(quote.total)}`,
    );

    const summary = page.getByText("Resumen del pedido", { exact: true }).locator("xpath=..");
    await summary.getByText(`$${money(quote.subtotal)}`, { exact: true }).first().waitFor({
      timeout: 10000,
    });
    await summary.getByText(`$${money(quote.deliveryFee)}`, { exact: true }).first().waitFor({
      timeout: 10000,
    });
    await summary
      .getByText(`$${String(quote.total)}`, { exact: true })
      .first()
      .waitFor({ timeout: 10000 });
    record("Totales del carrito coinciden con el quote", true);

    // ── 5. Checkout: errores visibles, pago y creación ──────────────────────
    await readyCta.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Confirmar pedido y entrega", { exact: true }).waitFor({
      timeout: 10000,
    });
    const confirmButton = dialog.getByRole("button", { name: /Confirmar y pedir ahora/ });

    await dialog.getByRole("button", { name: /Ingresar otra dirección/ }).click();
    await dialog
      .getByText("Por favor ingresa o confirma tu dirección de entrega para continuar.", {
        exact: true,
      })
      .waitFor({ timeout: 5000 });
    assert(await confirmButton.isDisabled(), "El checkout permite confirmar sin dirección.");
    record("Checkout bloquea dirección vacía", true);

    await dialog
      .locator('input[placeholder="Calle principal, número y referencia..."]')
      .fill(DELIVERY_ADDRESS);
    await waitUntil(
      async () =>
        !(await dialog
          .getByText("Por favor ingresa o confirma tu dirección de entrega para continuar.", {
            exact: true,
          })
          .isVisible()
          .catch(() => false)),
      5000,
      "dirección válida",
    );
    assert(await confirmButton.isEnabled(), "El checkout no se habilita con dirección válida.");

    await dialog.getByRole("button", { name: "Transferencia", exact: true }).click();
    await dialog
      .getByText("Adjunta la foto del comprobante de transferencia para confirmar el pedido.", {
        exact: true,
      })
      .waitFor({ timeout: 5000 });
    const bankVisible = await waitForTextIn(
      dialog,
      ["Datos Bancarios Oficiales", "Los datos bancarios aún no están configurados"],
      5000,
    );
    assert(bankVisible, "El modal de transferencia no muestra datos ni advertencia bancaria.");
    assert(await confirmButton.isDisabled(), "El checkout permite transferir sin comprobante.");
    record("Checkout exige comprobante en transferencia", true);

    await dialog.getByRole("button", { name: /Efectivo al recibir/ }).click();
    await dialog.getByText(new RegExp(`Pagarás\\s+\\$${escapeRegex(money(quote.total))} USD`)).waitFor({
      timeout: 5000,
    });
    assert(await confirmButton.isEnabled(), "El checkout no se habilita con efectivo y dirección.");
    await dialog
      .getByText(`$${money(quote.subtotal)}`, { exact: true })
      .first()
      .waitFor({ timeout: 5000 });
    await dialog
      .getByText(`$${money(quote.total)} USD`, { exact: true })
      .first()
      .waitFor({ timeout: 5000 });
    record("Checkout valida y muestra totales", true);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/order.create") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await confirmButton.click();
    const createResponse = await createResponsePromise;
    assert(createResponse, "No hubo respuesta de order.create (timeout).");
    const createJson = await createResponse.json().catch(() => null);
    const createData = unwrapTrpc(createJson);
    assert(
      createResponse.ok() && createData?.success && createData?.order?.id,
      `order.create falló (${createResponse.status()}): ${trpcError(createJson)}`,
    );
    const createdOrder = createData.order;
    state.orderIds.push(Number(createdOrder.id));
    console.log(`ORDER id=${createdOrder.id} total=${money(createdOrder.total)}`);

    const requestJson = createResponse.request().postDataJSON();
    const requestInput = requestJson?.json ?? requestJson;
    assert(requestInput && typeof requestInput === "object", "No se pudo leer el body de order.create.");
    for (const forbidden of ["subtotal", "deliveryFee", "commission", "total", "customerId"]) {
      assert(
        !(forbidden in requestInput),
        `El cliente envía ${forbidden} a order.create (debe calcularlo el servidor).`,
      );
    }
    assert(requestInput.paymentMethod === "cash", "order.create no usó efectivo.");
    assert(
      requestInput.deliveryAddress === DELIVERY_ADDRESS,
      "order.create no usó la dirección del checkout.",
    );
    assert(
      typeof requestInput.idempotencyKey === "string" && requestInput.idempotencyKey.length >= 8,
      "order.create sin idempotencyKey.",
    );
    assert(Number(createdOrder.customerId) === Number(customer.id), "Pedido de otro cliente.");
    assert(createdOrder.status === "received", `Estado inicial ${createdOrder.status} != received.`);
    assert(createdOrder.paymentMethod === "cash", "Método de pago distinto a cash.");
    assert(closeTo(createdOrder.subtotal, quote.subtotal), "Subtotal del pedido != quote.");
    assert(closeTo(createdOrder.deliveryFee, quote.deliveryFee), "Envío del pedido != quote.");
    assert(closeTo(createdOrder.total, quote.total), "Total del pedido != quote.");
    assert(createdOrder.deliveryAddress === DELIVERY_ADDRESS, "Dirección del pedido distinta.");
    record(
      "order.create usa totales del servidor",
      true,
      `pedido=${createdOrder.id} total=$${money(createdOrder.total)}`,
    );

    // Reintento idempotente: no debe crear otro pedido ni cambiar totales.
    const replay = await page.evaluate(async (body) => {
      const response = await fetch("/api/trpc/order.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      return { status: response.status, data: await response.json().catch(() => null) };
    }, requestJson);
    const replayData = unwrapTrpc(replay.data);
    assert(replay.status === 200 && replayData?.success, "El reintento idempotente falló.");
    assert(replayData.idempotent === true, "El reintento no se marcó idempotent=true.");
    assert(
      Number(replayData.order?.id) === Number(createdOrder.id),
      "El reintento creó o devolvió otro pedido.",
    );
    record("order.create es idempotente", true, `pedido=${createdOrder.id}`);

    await page.getByText("¡Pedido confirmado!", { exact: true }).waitFor({ timeout: 20000 });
    await page.getByText(`Pedido #${createdOrder.id}`, { exact: false }).waitFor({
      timeout: 10000,
    });
    assert((await readCart(page)) === null, "El carrito local no se limpió tras crear el pedido.");
    record("Pedido confirmado y carrito limpio", true);
    await shot("01-confirmado");

    // ── 6. Tracking ─────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Seguir pedido", exact: true }).click();
    await page.waitForURL(`**/order/${createdOrder.id}`, { timeout: 20000 });
    await page.getByText(`Pedido #${createdOrder.id}`, { exact: true }).waitFor({
      timeout: 30000,
    });
    await page
      .getByText("El comercio recibió tu pedido y lo está confirmando.", { exact: true })
      .waitFor({ timeout: 30000 });
    await page.getByText("Paso 1 de 6", { exact: true }).waitFor({ timeout: 10000 });
    const progressBar = page.getByRole("progressbar", { name: "Progreso del pedido" });
    await progressBar.waitFor({ timeout: 10000 });
    const progress = Number(await progressBar.getAttribute("aria-valuenow"));
    assert(progress > 0 && progress < 100, `Progreso inicial inesperado: ${progress}`);
    await page.getByText(product.name, { exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByText(DELIVERY_ADDRESS, { exact: true }).waitFor({ timeout: 15000 });
    await page
      .getByText(`$${money(createdOrder.total)}`, { exact: true })
      .first()
      .waitFor({ timeout: 15000 });
    record("Tracking muestra estado, paso, progreso y totales", true, `pedido=${createdOrder.id}`);
    const trackingLive = await waitForAnyText(page, ["En vivo"], 12000).catch(() => false);
    record(
      "SSE de tracking conectado",
      trackingLive,
      trackingLive ? "" : "indicador no llegó a En vivo (revisar SSE/proxy)",
    );
    await shot("02-tracking");

    // ── 7. Chat ─────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Abrir chat del pedido" }).click();
    await page.waitForURL(`**/chat/${createdOrder.id}`, { timeout: 20000 });
    await page.getByText(`Chat del Pedido #${createdOrder.id}`, { exact: true }).waitFor({
      timeout: 30000,
    });
    const chatLive = await waitForAnyText(page, ["Mensajes en tiempo real"], 12000).catch(
      () => false,
    );
    record(
      "SSE de chat conectado",
      chatLive,
      chatLive ? "" : "indicador no llegó a Mensajes en tiempo real",
    );

    const messageInput = page.locator('input[placeholder="Escribe un mensaje aquí..."]');
    await messageInput.waitFor({ timeout: 15000 });
    const sendResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/chat.send") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await messageInput.fill(CHAT_MESSAGE);
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    const sendResponse = await sendResponsePromise;
    assert(sendResponse, "No hubo respuesta de chat.send (timeout).");
    const sendJson = await sendResponse.json().catch(() => null);
    const sentMessage = unwrapTrpc(sendJson);
    assert(
      sendResponse.ok() && sentMessage?.id,
      `chat.send falló (${sendResponse.status()}): ${trpcError(sendJson)}`,
    );
    assert(sentMessage.senderType === "customer", "El backend no derivó senderType=customer.");
    assert(Number(sentMessage.senderId) === Number(customer.id), "senderId no es el cliente.");
    assert(sentMessage.message === CHAT_MESSAGE, "El mensaje enviado no coincide.");
    assert(Number(sentMessage.orderId) === Number(createdOrder.id), "Mensaje en otro pedido.");
    await page.getByText(CHAT_MESSAGE, { exact: true }).waitFor({ timeout: 15000 });
    record("Chat envía con identidad del servidor", true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(CHAT_MESSAGE, { exact: true }).waitFor({ timeout: 30000 });
    record("Chat persiste tras reload", true);
    await shot("03-chat");

    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await page.waitForURL(`**/order/${createdOrder.id}`, { timeout: 20000 });
    await page.getByText(`Pedido #${createdOrder.id}`, { exact: true }).waitFor({
      timeout: 20000,
    });

    // ── 8. Cancelación ──────────────────────────────────────────────────────
    const cancelButton = page.getByRole("button", { name: "Cancelar pedido", exact: true });
    await cancelButton.waitFor({ timeout: 15000 });
    let promptMessage = "";
    page.once("dialog", async (dialogEvent) => {
      promptMessage = dialogEvent.message();
      await dialogEvent.accept(CANCEL_REASON);
    });
    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/order.updateStatus") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await cancelButton.click();
    const updateResponse = await updateResponsePromise;
    assert(updateResponse, "No hubo respuesta de order.updateStatus (timeout).");
    const updateJson = await updateResponse.json().catch(() => null);
    const updatedOrder = unwrapTrpc(updateJson);
    assert(
      updateResponse.ok() && updatedOrder?.status === "cancelled",
      `order.updateStatus falló (${updateResponse.status()}): ${trpcError(updateJson)}`,
    );
    assert(
      updatedOrder.cancellationReason === CANCEL_REASON,
      "El motivo de cancelación no se guardó.",
    );
    assert(promptMessage.includes("cancelar"), "El prompt de cancelación no se mostró.");
    record("Cancelación por el cliente", true, `motivo=${CANCEL_REASON}`);

    await page.getByText(`Motivo: ${CANCEL_REASON}`, { exact: true }).waitFor({
      timeout: 20000,
    });
    await page.getByText("Cancelado", { exact: true }).first().waitFor({ timeout: 10000 });
    assert(
      (await page.getByRole("button", { name: "Cancelar pedido", exact: true }).count()) === 0,
      "El botón de cancelar sigue visible tras cancelar.",
    );
    record("UI refleja pedido cancelado y motivo", true);
    await shot("04-cancelado");

    // ── 9. Perfil y cierre de sesión ────────────────────────────────────────
    const profileOrdersResponsePromise = page
      .waitForResponse(
        (response) => response.url().includes("/api/trpc/order.getByCustomer"),
        { timeout: 30000 },
      )
      .catch(() => null);
    await page.goto(`${BASE_URL}/profile`, { waitUntil: "domcontentloaded" });
    await page.getByText("Historial de pedidos", { exact: true }).waitFor({ timeout: 30000 });
    const profileOrdersResponse = await profileOrdersResponsePromise;
    assert(profileOrdersResponse?.ok(), "El historial del perfil no respondió 200.");
    await page
      .getByText(`${customer.first_name} ${customer.last_name}`, { exact: true })
      .first()
      .waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Cerrar sesión" }).waitFor({ timeout: 10000 });
    record("Perfil e historial cargan con la sesión del cliente", true);

    authenticated = false;
    const logoutResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/trpc/customer.logout") &&
          response.request().method() === "POST",
        { timeout: 20000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL("**/customer-login", { timeout: 20000 });
    const logoutResponse = await logoutResponsePromise;
    assert(logoutResponse?.ok(), "customer.logout no respondió 200.");
    const afterLogoutCookies = await context.cookies(BASE_URL);
    assert(
      !afterLogoutCookies.some(
        (cookie) => cookie.name === "quickgo_token" && cookie.value,
      ) &&
        !afterLogoutCookies.some(
          (cookie) => cookie.name === "refresh_token" && cookie.value,
        ),
      "Logout no limpió las cookies de cliente.",
    );
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/customer-login", { timeout: 20000 });
    record("Logout limpia sesión y /home exige login", true);

    // ── 10. Higiene de errores ──────────────────────────────────────────────
    record("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    record(
      "Sin errores API 5xx/401/403 inesperados",
      apiErrors.length === 0,
      apiErrors.slice(0, 3).join(" | "),
    );
  } catch (error) {
    fatalError = error;
    record("Ejecución E2E", false, error.message);
  } finally {
    if (page && authenticated && SCREENSHOTS) {
      try {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOT_DIR, `failure-${RUN_TAG}.png`) });
      } catch {
        // La captura es best-effort.
      }
    }
    if (browser) await browser.close().catch(() => {});
    try {
      cleanupSummary = await cleanupDatabase(pool, state);
    } catch (error) {
      cleanupError = error;
      console.error("LIMPIEZA E2E FALLÓ:", error.message);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (cleanupSummary) {
    console.log(
      `LIMPIEZA orders=${cleanupSummary.orders} chat=${cleanupSummary.chat} ` +
        `items=${cleanupSummary.items} history=${cleanupSummary.history} ` +
        `otp=${cleanupSummary.otp} deleted=${cleanupSummary.deleted} ` +
        `deleted_otp=${cleanupSummary.deletedOtp}` +
        (cleanupSummary.error ? ` error=${cleanupSummary.error}` : ""),
    );
    const clean =
      cleanupSummary.orders === 0 &&
      cleanupSummary.chat === 0 &&
      cleanupSummary.items === 0 &&
      cleanupSummary.history === 0 &&
      cleanupSummary.otp === 0 &&
      !cleanupSummary.error &&
      !cleanupError;
    record(
      "Limpieza de datos temporales",
      clean,
      cleanupSummary.error || cleanupError?.message || "",
    );
  } else {
    record("Limpieza de datos temporales", false, cleanupError?.message || "sin resumen");
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0 || fatalError) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nE2E CLIENTE PRODUCCIÓN FALLÓ:", error.message);
  process.exitCode = 1;
});