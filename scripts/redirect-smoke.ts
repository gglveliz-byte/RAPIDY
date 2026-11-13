import "dotenv/config";
import { chromium } from "playwright-core";
import { setCustomerCookies } from "../server/customer-auth";

const BASE = "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`;

async function main() {
  const reqHeaders = new Headers({ host: "localhost:3000" });
  const resHeaders = new Headers();
  await setCustomerCookies(resHeaders, reqHeaders, 1);
  const setCookies = resHeaders.getSetCookie();
  const cookiePairs = setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .map((pair) => {
      const index = pair.indexOf("=");
      return { name: pair.slice(0, index), value: pair.slice(index + 1) };
    });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    cookiePairs.map(({ name, value }) => ({
      name,
      value,
      url: BASE,
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.getByText("Todos los Comercios").first().waitFor({ timeout: 15000 });
  console.log("HOME OK");

  // Simula el tap del logo de marca dentro de Home.
  console.log("HEADERS:", await page.locator("header").count());
  console.log("EMBLEMS:", await page.locator('img[alt="Rapidy Emblem"]').count());
  const emblem = page.locator('img[alt="Rapidy Emblem"]').last();
  await emblem.click({ force: true });
  await page.waitForTimeout(600);
  console.log("LOGO URL:", new URL(page.url()).pathname);
  console.log("SESSION STILL HOME:", await page.getByText("Todos los Comercios").first().isVisible());

  // Landing pública con sesión activa.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 10000 });
  console.log("LANDING REDIRECT:", new URL(page.url()).pathname);

  // Login con sesión activa.
  await page.goto(`${BASE}/customer-login`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 10000 });
  await page.getByText("Todos los Comercios").first().waitFor({ timeout: 10000 });
  console.log("LOGIN REDIRECT:", new URL(page.url()).pathname);
  console.log("SESSION SURVIVED:", await page.getByText("Todos los Comercios").first().isVisible());
  console.log("PAGE ERRORS:", errors.length);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});