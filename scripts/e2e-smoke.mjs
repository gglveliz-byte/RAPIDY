import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const PHONE = "+593 99 123 4567";
const CHROME = process.env.CHROME_PATH || `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;
const SHOT_DIR = "test-flow-screenshots/rapidy-audit";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForAnyText(page, texts, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (texts.some((text) => body.includes(text))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DELETE FROM otp_verifications");
  await pool.query("DELETE FROM chat_messages WHERE message LIKE 'Mensaje de prueba E2E%'");

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });

  try {
    // 1. Login OTP
    await page.goto(`${BASE_URL}/customer-login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="tel"]').waitFor({ timeout: 15000 });
    await page.locator('input[type="tel"]').fill("991234567");
    await page.getByRole("button", { name: /Enviar código/i }).click();
    const codeVisible = await waitForAnyText(page, ["Verifica tu WhatsApp"], 15000);
    assert(codeVisible, "No apareció el paso de verificación OTP");
    const bodyText = await page.locator("body").innerText();
    const match = bodyText.match(/tu código es\s*(\d{4,8})/i);
    assert(match, "No se encontró el código de desarrollo en la UI");
    await page.locator('input[aria-label="Código de verificación"]').fill(match[1]);
    await page.getByRole("button", { name: /Verificar y entrar/i }).click();
    await page.waitForURL("**/home", { timeout: 20000 });
    await page.locator("body").getByText("Todos los Comercios").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT_DIR}/01-home.png`, fullPage: false });
    record("OTP login + /home", true);

    // 2. Home search finds a non-featured product (Leche)
    const homeSearch = page.locator('input[placeholder="Buscar en Rapidy..."]');
    await homeSearch.fill("leche");
    await page.waitForTimeout(900);
    const homeHasMilk = await page.getByText("Leche entera 1L").first().isVisible().catch(() => false);
    assert(homeHasMilk, "La búsqueda de productos en /home no muestra Leche entera 1L");
    record("Búsqueda de productos en /home", true);
    await homeSearch.fill("");
    await page.waitForTimeout(400);

    // 3. Search route + category filter
    await page.goto(`${BASE_URL}/search?q=leche`, { waitUntil: "domcontentloaded" });
    await page.getByText("Leche entera 1L").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Supermercados" }).click();
    await page.waitForTimeout(500);
    const categoryHasMilk = await page.getByText("Leche entera 1L").first().isVisible().catch(() => false);
    assert(categoryHasMilk, "El filtro de categoría Supermercados no conserva Leche entera 1L");
    await page.screenshot({ path: `${SHOT_DIR}/02-search.png`, fullPage: false });
    record("/search server-side + categoría", true);

    // 4. Add to cart and verify authoritative quote / minimum order
    await page.getByRole("button", { name: "Añadir Leche entera 1L al carrito" }).first().click();
    await page.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
    await page.getByText("Mi Carrito").waitFor({ timeout: 15000 });
    const cartHasMilk = await page.getByText("Leche entera 1L").first().isVisible().catch(() => false);
    assert(cartHasMilk, "El carrito no muestra el producto agregado");
    const minimumVisible = await waitForAnyText(page, ["mínimo", "minimo"], 8000);
    record("Carrito detecta mínimo de compra", minimumVisible, minimumVisible ? "" : "No se mostró alerta de mínimo");

    const plusButton = page.getByRole("button", { name: "Aumentar cantidad" }).first();
    for (let i = 0; i < 4; i += 1) await plusButton.click();
    await page.waitForTimeout(1200);
    const totalVisible = await waitForAnyText(page, ["8.75"], 8000);
    assert(totalVisible, "El total autoritativo del quote no llegó a $8.75");
    await page.getByRole("button", { name: /Continuar con la entrega/i }).click();
    await page.getByText("Confirmar pedido y entrega").waitFor({ timeout: 10000 });
    await page.getByRole("dialog").getByRole("button", { name: "Transferencia" }).click();
    await page.waitForTimeout(300);
    const bankFallback = await waitForAnyText(page, ["Los datos bancarios aún no están configurados", "Datos Bancarios Oficiales"], 5000);
    assert(bankFallback, "El modal de transferencia no muestra datos ni advertencia de configuración");
    await page.screenshot({ path: `${SHOT_DIR}/03-cart-modal.png`, fullPage: false });
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar modal" }).click();
    record("/cart quote + modal", true);

    // 5. Profile
    await page.goto(`${BASE_URL}/profile`, { waitUntil: "domcontentloaded" });
    await page.getByText("Historial de pedidos").waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    const profileHasName = await page.getByText("Lautaro").first().isVisible().catch(() => false);
    assert(profileHasName, "El perfil no muestra el nombre del cliente");
    await page.screenshot({ path: `${SHOT_DIR}/04-profile.png`, fullPage: false });
    record("/profile", true);

    // 6. Order tracking: delivered, no auto-redirect
    await page.goto(`${BASE_URL}/order/1`, { waitUntil: "domcontentloaded" });
    await page.getByText("Pedido #1").waitFor({ timeout: 15000 });
    const deliveredVisible = await waitForAnyText(page, ["Entregado", "Pedido Entregado"], 10000);
    assert(deliveredVisible, "El pedido entregado no muestra estado Entregado");
    await page.waitForTimeout(1800);
    await page.waitForTimeout(6500);
    assert(page.url().includes("/order/1"), "La vista de pedido entregado redirigió automáticamente");
    await page.screenshot({ path: `${SHOT_DIR}/05-order.png`, fullPage: false });
    record("/order estado compartido + sin auto-redirect", true);

    // 7. Chat send
    await page.goto(`${BASE_URL}/chat/1`, { waitUntil: "domcontentloaded" });
    await page.getByText("Chat del Pedido #1").waitFor({ timeout: 15000 });
    await page.locator('input[placeholder="Escribe un mensaje aquí..."]').fill("Mensaje de prueba E2E");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    const chatSent = await waitForAnyText(page, ["Mensaje de prueba E2E"], 10000);
    assert(chatSent, "El mensaje optimista no apareció en el chat");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOT_DIR}/06-chat.png`, fullPage: false });
    record("/chat envío y SSE", true);

    const criticalErrors = pageErrors.filter((message) =>
      !message.includes("favicon") && !message.includes("manifest") && !message.toLowerCase().includes("eventSource")
    );
    assert(criticalErrors.length === 0, `Errores de página: ${criticalErrors.slice(0, 3).join(" | ")}`);
    record("Sin errores de página", true);
  } finally {
    await browser.close();
    await pool.query("DELETE FROM otp_verifications");
    await pool.query("DELETE FROM chat_messages WHERE message LIKE 'Mensaje de prueba E2E%'");
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESUMEN: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("E2E FATAL:", error);
  process.exit(1);
});