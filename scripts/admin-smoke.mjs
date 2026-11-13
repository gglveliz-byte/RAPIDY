import "dotenv/config";

const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const body = JSON.stringify({
  json: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
});

const login = await fetch(`${base}/api/trpc/login.login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const loginJson = await login.json();
const cookies = login.headers.getSetCookie?.() ?? [];
console.log("SET-COOKIE COUNT:", cookies.length);
const cookieMap = new Map();
for (const setCookie of cookies) {
  const pair = setCookie.split(";")[0];
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (value) cookieMap.set(name, value);
  else cookieMap.delete(name);
}
console.log("ACTIVE COOKIES:", [...cookieMap.keys()]);
const cookieHeader = [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
const role = loginJson?.result?.data?.json?.role;
console.log("ADMIN LOGIN:", login.status, role);

const driverList = await fetch(`${base}/api/trpc/driver.list?input=${encodeURIComponent("{}")}`, {
  headers: { cookie: cookieHeader },
});
console.log("ADMIN driver.list:", driverList.status);

const anonDriverList = await fetch(`${base}/api/trpc/driver.list?input=${encodeURIComponent("{}")}`);
console.log("ANON driver.list:", anonDriverList.status);