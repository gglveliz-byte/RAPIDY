import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";
import { randomInt, randomUUID } from "node:crypto";

// Smoke de autenticación para producción.
// No requiere credenciales reales: crea usuarios temporales admin/merchant y un
// driver temporal, y los elimina al terminar. No modifica login-router ni las
// cookies del servidor; solo inspecciona las respuestas HTTP.
const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const BASE_HOST = new URL(BASE_URL).host;
// Cabeceras equivalentes a las de un proxy HTTPS real para forzar la rama
// Secure de getSessionCookieOptions sin montar TLS en local.
const OUTSIDE_HOST = process.env.SMOKE_OUTSIDE_HOST || "auth-smoke.example.test";
const OUTSIDE_ORIGIN = `https://${OUTSIDE_HOST}`;
const BASE_IS_LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE_HOST);
const BASE_IS_HTTPS = new URL(BASE_URL).protocol === "https:";
// Si la URL no es HTTPS real, se simulan las cabeceras del proxy para validar
// la rama Secure sin depender de TLS local.
const SIMULATE_PROXY = BASE_IS_LOCALHOST || !BASE_IS_HTTPS;

const ROLE_COOKIES = {
  admin: { access: "quickgo_admin_token", refresh: "quickgo_admin_refresh" },
  merchant: { access: "quickgo_merchant_token", refresh: "quickgo_merchant_refresh" },
  driver: { access: "quickgo_driver_token", refresh: "quickgo_driver_refresh" },
};

const ROLE_PROTECTED = {
  admin: { path: "admin.dashboard", label: "admin.dashboard" },
  merchant: { path: "commerce.me", label: "commerce.me" },
  driver: { path: "driver.getProfile", label: "driver.getProfile", input: {} },
};

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const payload = (result) => result.data?.result?.data?.json;
const errorMessage = (result) => result.data?.error?.json?.message || "";

function readSetCookies(source) {
  if (Array.isArray(source)) return source;
  if (source && Array.isArray(source.setCookies)) return source.setCookies;
  const response = source;
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseSetCookie(raw) {
  const [pair, ...attributeParts] = raw.split(";").map((part) => part.trim());
  const equals = pair.indexOf("=");
  const name = equals === -1 ? pair : pair.slice(0, equals);
  const value = equals === -1 ? "" : pair.slice(equals + 1);
  const attrs = new Map();
  for (const attribute of attributeParts) {
    const [key, ...rest] = attribute.split("=");
    attrs.set(key.toLowerCase(), rest.join("="));
  }
  return {
    raw,
    name,
    value,
    has: (key) => attrs.has(key.toLowerCase()),
    get: (key) => attrs.get(key.toLowerCase()),
  };
}

function setCookiesFor(response, name) {
  return readSetCookies(response)
    .map(parseSetCookie)
    .filter((cookie) => cookie.name === name);
}

function currentCookie(response, name) {
  // En un mismo response puede venir primero el borrado (value vacío) y después
  // el valor nuevo; el valor vigente es el último no vacío.
  return setCookiesFor(response, name).filter((cookie) => cookie.value !== "").at(-1) ?? null;
}

function deletionCookie(response, name) {
  return setCookiesFor(response, name).find((cookie) => cookie.value === "") ?? null;
}

function jarFrom(response, jar = new Map()) {
  for (const cookie of readSetCookies(response)) {
    const parsed = parseSetCookie(cookie);
    if (parsed.value) jar.set(parsed.name, parsed.value);
    else jar.delete(parsed.name);
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(method, path, { input, jar, outside } = {}) {
  let url = `${BASE_URL}/api/trpc/${path}`;
  const headers = {};
  if (method === "GET") {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}`;
  } else {
    headers["Content-Type"] = "application/json";
  }
  if (jar && jar.size > 0) headers.cookie = cookieHeader(jar);
  if (outside) {
    // Simula el proxy de producción: host y proto externos.
    headers["x-forwarded-host"] = OUTSIDE_HOST;
    headers["x-forwarded-proto"] = "https";
  }
  if (method !== "GET") {
    // El servidor valida Origin/Referer en mutaciones (CSRF), también en
    // producción; sin esta cabecera el smoke recibiría 403.
    headers.origin = outside ? OUTSIDE_ORIGIN : new URL(BASE_URL).origin;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({ json: input ?? {} }),
  });
  if (jar) jarFrom(response, jar);
  const setCookies = readSetCookies(response);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, setCookies };
}

const get = (path, input, jar, outside) => request("GET", path, { input, jar, outside });
const post = (path, input, jar, outside) => request("POST", path, { input, jar, outside });

function refreshOnly(jar, role) {
  const token = jar.get(ROLE_COOKIES[role].refresh);
  if (!token) throw new Error(`No hay refresh cookie de ${role}`);
  return new Map([[ROLE_COOKIES[role].refresh, token]]);
}

function cookieFlags(cookie) {
  if (!cookie) return "cookie ausente";
  const flags = [
    cookie.has("httponly") ? "HttpOnly" : "sin HttpOnly",
    cookie.has("secure") ? "Secure" : "sin Secure",
    `SameSite=${cookie.get("samesite") ?? "?"}`,
    `Path=${cookie.get("path") ?? "?"}`,
  ];
  return flags.join(", ");
}

function assertSessionCookieFlags(response, role, { secure }) {
  const cookie = currentCookie(response, ROLE_COOKIES[role].access);
  const refresh = currentCookie(response, ROLE_COOKIES[role].refresh);
  const ok =
    Boolean(cookie) &&
    Boolean(refresh) &&
    cookie.has("httponly") &&
    refresh.has("httponly") &&
    cookie.has("secure") === secure &&
    refresh.has("secure") === secure &&
    cookie.get("path") === "/" &&
    refresh.get("path") === "/";
  return { ok, detail: cookieFlags(cookie) };
}

function foreignCookiesPresent(jar, role) {
  return Object.entries(ROLE_COOKIES)
    .filter(([otherRole]) => otherRole !== role)
    .flatMap(([, names]) => [names.access, names.refresh])
    .filter((name) => jar.has(name));
}

async function createFixtures(pool) {
  const password = `Smoke-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const stamp = `${Date.now()}-${randomInt(1000, 10000)}`;
  const adminEmail = `auth-smoke-admin-${stamp}@example.test`;
  const merchantEmail = `auth-smoke-merchant-${stamp}@example.test`;
  const createdUserIds = [];
  let createdDriverId = null;

  try {
    const admin = (
      await pool.query(
        `insert into users ("unionId", name, email, password_hash, role)
         values ($1, 'Smoke Auth Admin', $2, $3, 'admin')
         returning id`,
        [`auth-smoke-admin-${randomUUID()}`, adminEmail, passwordHash],
      )
    ).rows[0];
    createdUserIds.push(admin.id);

    const merchant = (
      await pool.query(
        `insert into users ("unionId", name, email, password_hash, role)
         values ($1, 'Smoke Auth Merchant', $2, $3, 'merchant')
         returning id`,
        [`auth-smoke-merchant-${randomUUID()}`, merchantEmail, passwordHash],
      )
    ).rows[0];
    createdUserIds.push(merchant.id);

    let phone = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `09${randomInt(10_000_000, 100_000_000)}`;
      const existing = await pool.query(
        "select 1 from drivers where right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = right($1, 9)",
        [candidate],
      );
      if (existing.rowCount === 0) {
        phone = candidate;
        break;
      }
    }
    if (!phone) throw new Error("No se pudo generar un teléfono de driver libre");

    const driver = (
      await pool.query(
        `insert into drivers (name, phone, password_hash, vehicle, license_plate, status, commission_rate)
         values ('Smoke Auth Driver', $1, $2, 'Moto Smoke', 'AUTH-01', 'online', '75.00')
         returning id`,
        [phone, passwordHash],
      )
    ).rows[0];
    createdDriverId = driver.id;

    return {
      password,
      admin: { id: admin.id, email: adminEmail, password },
      merchant: { id: merchant.id, email: merchantEmail, password },
      driver: { id: driver.id, phone, password },
    };
  } catch (error) {
    if (createdDriverId) {
      await pool.query("delete from drivers where id = $1", [createdDriverId]).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await pool
        .query("delete from users where id = any($1::int[])", [createdUserIds])
        .catch(() => {});
    }
    throw error;
  }
}

async function cleanupFixtures(pool, fixtures) {
  if (!fixtures) return;
  await pool
    .query("delete from drivers where id = $1", [fixtures.driver.id])
    .catch(() => {});
  await pool
    .query("delete from users where id = any($1::int[])", [
      [fixtures.admin.id, fixtures.merchant.id],
    ])
    .catch(() => {});
}

function loginInput(role, fixtures) {
  if (role === "driver") {
    return { phone: fixtures.driver.phone, password: fixtures.driver.password };
  }
  return { email: fixtures[role].email, password: fixtures[role].password };
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let fixtures = null;

  try {
    // 401 anónimo en endpoints protegidos de cada rol.
    const anonymousJar = new Map();
    for (const role of Object.keys(ROLE_PROTECTED)) {
      const { path, label, input } = ROLE_PROTECTED[role];
      const response = await get(path, input, anonymousJar);
      record(
        `Anónimo recibe 401 en ${label}`,
        response.status === 401,
        `${response.status} ${errorMessage(response)}`,
      );
    }
    const anonymousCheck = await get("login.checkAuth", undefined, anonymousJar);
    record(
      "checkAuth anónimo responde no autenticado",
      anonymousCheck.status === 200 &&
        payload(anonymousCheck)?.authenticated === false &&
        payload(anonymousCheck)?.role === null,
      `status=${anonymousCheck.status} authenticated=${payload(anonymousCheck)?.authenticated}`,
    );

    fixtures = await createFixtures(pool);
    const sessions = {};

    // Login, cookies locales, checkAuth y endpoint protegido por rol.
    for (const role of Object.keys(ROLE_PROTECTED)) {
      const jar = new Map();
      const login = await post("login.login", loginInput(role, fixtures), jar);
      const body = payload(login);
      sessions[role] = jar;
      record(
        `Login ${role}`,
        login.status === 200 &&
          body?.success === true &&
          body?.role === role &&
          body?.user?.id === fixtures[role].id,
        `status=${login.status} role=${body?.role ?? "?"}`,
      );

      const localFlags = assertSessionCookieFlags(login, role, { secure: false });
      record(
        `Cookies ${role} locales HttpOnly y sin Secure`,
        localFlags.ok,
        localFlags.detail,
      );

      const foreign = foreignCookiesPresent(jar, role);
      record(
        `Login ${role} no deja cookies de otros roles`,
        foreign.length === 0,
        foreign.length ? foreign.join(", ") : "ok",
      );

      const check = await get("login.checkAuth", undefined, jar);
      const checkBody = payload(check);
      record(
        `checkAuth ${role}`,
        check.status === 200 &&
          checkBody?.authenticated === true &&
          checkBody?.role === role &&
          checkBody?.user?.id === fixtures[role].id,
        `role=${checkBody?.role ?? "?"} id=${checkBody?.user?.id ?? "?"}`,
      );

      const { path, input, label } = ROLE_PROTECTED[role];
      const protectedResponse = await get(path, input, jar);
      record(
        `${role} accede a ${label}`,
        protectedResponse.status === 200,
        `${protectedResponse.status} ${errorMessage(protectedResponse)}`,
      );
    }

    // Un rol no puede usar el endpoint de otro rol aunque tenga sesión válida.
    for (const role of Object.keys(ROLE_PROTECTED)) {
      for (const otherRole of Object.keys(ROLE_PROTECTED)) {
        if (role === otherRole) continue;
        const { path, input, label } = ROLE_PROTECTED[otherRole];
        const response = await get(path, input, sessions[role]);
        record(
          `${role} no accede a ${label}`,
          response.status === 401,
          `${response.status} ${errorMessage(response)}`,
        );
      }
    }

    // Refresh de cada rol usando únicamente la cookie de refresh.
    for (const role of Object.keys(ROLE_COOKIES)) {
      const jar = refreshOnly(sessions[role], role);
      const oldRefresh = jar.get(ROLE_COOKIES[role].refresh);
      const response = await post("login.refresh", {}, jar);
      const body = payload(response);
      const access = currentCookie(response, ROLE_COOKIES[role].access);
      const rotatedRefresh = currentCookie(response, ROLE_COOKIES[role].refresh);
      record(
        `Refresh ${role} con solo refresh cookie`,
        response.status === 200 &&
          body?.success === true &&
          body?.role === role &&
          Boolean(access) &&
          Boolean(rotatedRefresh) &&
          rotatedRefresh.value !== oldRefresh,
        `status=${response.status} role=${body?.role ?? "?"}`,
      );

      const check = await get("login.checkAuth", undefined, jar);
      record(
        `Refresh ${role} permite checkAuth`,
        payload(check)?.authenticated === true && payload(check)?.role === role,
        `role=${payload(check)?.role ?? "?"}`,
      );
    }

    // admin.refresh como endpoint independiente de login.refresh.
    const adminRefreshJar = refreshOnly(sessions.admin, "admin");
    const adminRefresh = await post("admin.refresh", {}, adminRefreshJar);
    record(
      "admin.refresh renueva una sesión vigente",
      adminRefresh.status === 200 &&
        payload(adminRefresh)?.success === true &&
        payload(adminRefresh)?.admin?.id === fixtures.admin.id,
      `status=${adminRefresh.status} success=${payload(adminRefresh)?.success ?? "?"}`,
    );

    // Fuera de localhost, por inspección de Set-Cookie: Secure + HttpOnly.
    // Se simulan las cabeceras del proxy HTTPS sobre el servidor local.
    for (const role of Object.keys(ROLE_COOKIES)) {
      const jar = new Map();
      const login = await post(
        "login.login",
        loginInput(role, fixtures),
        jar,
        SIMULATE_PROXY,
      );
      const flags = assertSessionCookieFlags(login, role, { secure: true });
      record(
        `Cookies ${role} fuera de localhost son Secure y HttpOnly`,
        login.status === 200 && flags.ok,
        `status=${login.status} ${flags.detail}`,
      );
    }

    // Aislamiento en un mismo navegador: cada login profesional limpia el rol
    // anterior (admin <-> merchant <-> driver).
    const switchJar = new Map();
    const switchOrder = ["admin", "merchant", "driver", "admin"];
    const switchDetails = [];
    let switchOk = true;
    for (const role of switchOrder) {
      const response = await post("login.login", loginInput(role, fixtures), switchJar);
      const check = await get("login.checkAuth", undefined, switchJar);
      const checkBody = payload(check);
      const hasOwn =
        switchJar.has(ROLE_COOKIES[role].access) && switchJar.has(ROLE_COOKIES[role].refresh);
      const foreign = foreignCookiesPresent(switchJar, role);
      const stepOk =
        response.status === 200 &&
        checkBody?.role === role &&
        hasOwn &&
        foreign.length === 0;
      if (!stepOk) switchOk = false;
      switchDetails.push(`${role}:${checkBody?.role ?? "?"}${foreign.length ? `+${foreign}` : ""}`);
    }
    record(
      "Cambio de rol limpia las cookies del rol anterior",
      switchOk,
      switchDetails.join(" -> "),
    );

    // Logout y revocación. Se usa un login independiente por rol porque el
    // logout incrementa session_version y revoca todas las sesiones del usuario.
    for (const role of Object.keys(ROLE_COOKIES)) {
      const jar = new Map();
      await post("login.login", loginInput(role, fixtures), jar);
      const oldAccess = jar.get(ROLE_COOKIES[role].access);
      const oldRefresh = jar.get(ROLE_COOKIES[role].refresh);

      const logout = await post("login.logout", { scope: role }, jar);
      const accessDeletion = deletionCookie(logout, ROLE_COOKIES[role].access);
      const refreshDeletion = deletionCookie(logout, ROLE_COOKIES[role].refresh);
      record(
        `Logout ${role} limpia las cookies de sesión`,
        logout.status === 200 &&
          payload(logout)?.success === true &&
          Boolean(accessDeletion) &&
          Boolean(refreshDeletion) &&
          accessDeletion.get("max-age") === "0" &&
          refreshDeletion.get("max-age") === "0",
        `access=${accessDeletion?.get("max-age") ?? "?"} refresh=${refreshDeletion?.get("max-age") ?? "?"}`,
      );

      // El access anterior debe dejar de servir.
      const accessOnly = new Map([[ROLE_COOKIES[role].access, oldAccess]]);
      const protectedResponse = await get(
        ROLE_PROTECTED[role].path,
        ROLE_PROTECTED[role].input,
        accessOnly,
      );
      record(
        `Logout ${role} revoca el access anterior`,
        protectedResponse.status === 401,
        `${protectedResponse.status} ${errorMessage(protectedResponse)}`,
      );

      // login.refresh debe rechazar el refresh anterior.
      const refreshResponse = await post(
        "login.refresh",
        {},
        new Map([[ROLE_COOKIES[role].refresh, oldRefresh]]),
      );
      record(
        `Logout ${role} invalida login.refresh`,
        payload(refreshResponse)?.success === false,
        `success=${payload(refreshResponse)?.success ?? "?"}`,
      );

      // Reintento del refresh sin access token. Este camino es el que usa el
      // contexto para renovar de forma transparente.
      const replayJar = new Map([[ROLE_COOKIES[role].refresh, oldRefresh]]);
      const replayCheck = await get("login.checkAuth", undefined, replayJar);
      const replayBody = payload(replayCheck);
      const replayAccess = currentCookie(replayCheck, ROLE_COOKIES[role].access);
      const replayRefresh = currentCookie(replayCheck, ROLE_COOKIES[role].refresh);
      const recheck = await get("login.checkAuth", undefined, replayJar);
      const recheckBody = payload(recheck);
      record(
        `Logout ${role} no reemite sesión con refresh revocado`,
        !(replayBody?.authenticated === true) &&
          !(recheckBody?.authenticated === true) &&
          !Boolean(replayAccess) &&
          !Boolean(replayRefresh),
        `check=${replayBody?.authenticated}/${recheckBody?.authenticated} ` +
          `set-cookie=${replayAccess ? "access" : "-"},${replayRefresh ? "refresh" : "-"}`,
      );

      // admin.refresh es un endpoint aparte que también acepta el refresh cookie.
      if (role === "admin") {
        const adminRefresh = await post(
          "admin.refresh",
          {},
          new Map([[ROLE_COOKIES[role].refresh, oldRefresh]]),
        );
        record(
          "Logout admin invalida admin.refresh",
          payload(adminRefresh)?.success === false,
          `success=${payload(adminRefresh)?.success ?? "?"}`,
        );
      }
    }
  } finally {
    await cleanupFixtures(pool, fixtures);
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("AUTH PRODUCTION SMOKE FAILED:", error);
  process.exitCode = 1;
});