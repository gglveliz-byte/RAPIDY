import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
// Driver dedicado al smoke para no interferir con sesiones o pedidos reales.
const DRIVER_PHONE = "0990000001";
const DRIVER_PASSWORD = "smoke1234";
const MERCHANT_EMAIL = process.env.E2E_MERCHANT_EMAIL || "comercio@test.com";
const MERCHANT_PASSWORD = process.env.E2E_MERCHANT_PASSWORD || "comercio123";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
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
async function post(path, input, jar) {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
    },
    body: JSON.stringify({ json: input }),
  });
  jarFrom(response, jar);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
async function get(path, input, jar) {
  const response = await fetch(
    `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? {} }))}`,
    { headers: jar ? { cookie: cookieHeader(jar) } : {} },
  );
  jarFrom(response, jar);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
const payload = (result) => result.data?.result?.data?.json;

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash(DRIVER_PASSWORD, 10);
  const existingDriver = (
    await pool.query("select id from drivers where phone = $1", [DRIVER_PHONE])
  ).rows[0];
  const testDriverId =
    existingDriver?.id ??
    (
      await pool.query(
        `insert into drivers (name, phone, password_hash, vehicle, license_plate, status, commission_rate)
         values ('Driver Smoke', $1, $2, 'Moto Smoke', 'SMK-001', 'online', '75.00')
         returning id`,
        [DRIVER_PHONE, passwordHash],
      )
    ).rows[0].id;
  await pool.query(
    "update drivers set password_hash = $1, status = 'online', commission_rate = '75.00', session_version = coalesce(session_version, 0) + 1 where id = $2",
    [passwordHash, testDriverId],
  );
  const product = (
    await pool.query(
      "select id, name, price from products where commerce_id = 1 order by id limit 1",
    )
  ).rows[0];
  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];

  const order = (
    await pool.query(
      `insert into orders
        (customer_id, status, subtotal, delivery_fee, commission, total, payment_method, delivery_address, customer_phone)
       values ($1, 'ready_for_pickup', '10.00', '2.50', '1.00', '12.50', 'cash', 'Dirección test driver', '0999999999')
       returning id`,
      [customer.id],
    )
  ).rows[0];

  await pool.query(
    `insert into order_items
      (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
     values ($1, $2, 1, $3, '1', $4, '10.00')`,
    [order.id, product.id, product.name, product.price],
  );
  await pool.query(
    `insert into order_commerce_status (order_id, commerce_id, status, commission_amount)
     values ($1, 1, 'ready_for_pickup', '1.00')`,
    [order.id],
  );

  try {
    const jar = new Map();
    const login = await post(
      "login.login",
      { phone: DRIVER_PHONE, password: DRIVER_PASSWORD },
      jar,
    );
    record(
      "Login driver",
      login.status === 200 && payload(login)?.role === "driver",
      payload(login)?.role,
    );

    const available = await get("order.getAvailableForDriver", undefined, jar);
    const list = payload(available);
    record("Disponibles responde", available.status === 200 && Array.isArray(list));
    const testOrder = list?.find((item) => item.id === order.id);
    record("Pedido de prueba visible", Boolean(testOrder));
    record(
      "Sin PII pre-aceptación",
      Boolean(
        testOrder &&
          !("customerPhone" in testOrder) &&
          !("notes" in testOrder) &&
          !("deliveryAddress" in testOrder),
      ),
    );
    record(
      "Ganancia estimada neta",
      testOrder?.estimatedEarning === "1.88",
      testOrder?.estimatedEarning,
    );

    const accept = await post("driver.acceptOrder", { orderId: order.id }, jar);
    const accepted = (
      await pool.query("select status, driver_id from orders where id = $1", [order.id])
    ).rows[0];
    record(
      "Aceptar deja driver_assigned",
      accept.status === 200 &&
        accepted.status === "driver_assigned" &&
        Number(accepted.driver_id) === Number(testDriverId),
      `${accept.status} ${accepted.status} ${accept.data?.error?.json?.message || ""}`,
    );

    const earlyDeliver = await post(
      "order.updateStatus",
      { id: order.id, status: "delivered" },
      jar,
    );
    record("No puede entregar sin retirar", earlyDeliver.status >= 400);

    const pickup = await post(
      "driver.markCommercePickup",
      { orderId: order.id, commerceId: 1 },
      jar,
    );
    const picked = (
      await pool.query("select status from orders where id = $1", [order.id])
    ).rows[0];
    record(
      "Retiro por comercio pasa a picked_up",
      pickup.status === 200 && picked.status === "picked_up",
      `${pickup.status} ${picked.status}`,
    );

    const onWay = await post(
      "order.updateStatus",
      { id: order.id, status: "on_the_way" },
      jar,
    );
    record("Pasa a on_the_way", onWay.status === 200);

    const delivered = await post(
      "order.updateStatus",
      { id: order.id, status: "delivered" },
      jar,
    );
    const deliveredRow = (
      await pool.query("select status, delivered_at from orders where id = $1", [order.id])
    ).rows[0];
    record(
      "Entrega y delivered_at",
      delivered.status === 200 &&
        deliveredRow.status === "delivered" &&
        Boolean(deliveredRow.delivered_at),
      deliveredRow.status,
    );

    const earning = (
      await pool.query(
        "select amount, date from driver_earnings where order_id = $1",
        [order.id],
      )
    ).rows[0];
    record(
      "Ganancia creada",
      Boolean(earning) && Number(earning.amount) === 1.88,
      earning?.amount,
    );

    const history = await get("driver.getOrderHistory", { limit: 50 }, jar);
    const historyOrder = payload(history)?.find((item) => item.id === order.id);
    record(
      "Historial con earningAmount",
      history.status === 200 && historyOrder?.earningAmount === "1.88",
      historyOrder?.earningAmount,
    );
    record(
      "Historial sin teléfono",
      history.status === 200 && !("customerPhone" in (historyOrder || {})),
    );

    const message = await pool.query(
      `insert into chat_messages (order_id, sender_type, sender_id, sender_name, message)
       values ($1, 'customer', $2, 'Cliente', 'Mensaje de prueba driver')
       returning id`,
      [order.id, customer.id],
    );
    const markRead = await post("chat.markAsRead", { orderId: order.id }, jar);
    const readFlag = (
      await pool.query(
        "select read_by_driver, is_read from chat_messages where id = $1",
        [message.rows[0].id],
      )
    ).rows[0];
    record(
      "Chat marca lectura por rol",
      markRead.status === 200 && readFlag.read_by_driver === "yes",
      `${readFlag.read_by_driver}/${readFlag.is_read}`,
    );

    const merchantJar = new Map();
    await post(
      "login.login",
      { email: MERCHANT_EMAIL, password: MERCHANT_PASSWORD },
      merchantJar,
    );
    const driverLogin = await post(
      "login.login",
      { phone: DRIVER_PHONE, password: DRIVER_PASSWORD },
      merchantJar,
    );
    const check = await get("login.checkAuth", undefined, merchantJar);
    record(
      "Login driver limpia cookies merchant",
      driverLogin.status === 200 && payload(check)?.role === "driver",
      payload(check)?.role,
    );

    const logoutJar = new Map();
    await post(
      "login.login",
      { phone: DRIVER_PHONE, password: DRIVER_PASSWORD },
      logoutJar,
    );
    const oldCookieHeader = cookieHeader(logoutJar);
    const logout = await post("driver.logoutSession", {}, logoutJar);
    const oldSessionCheck = await fetch(
      `${BASE_URL}/api/trpc/login.checkAuth?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
      { headers: { cookie: oldCookieHeader } },
    );
    const oldSessionPayload = await oldSessionCheck.json().catch(() => null);
    record(
      "Logout driver revoca tokens anteriores",
      logout.status === 200 &&
        oldSessionPayload?.result?.data?.json?.authenticated === false,
    );
  } finally {
    await pool.query("delete from driver_earnings where order_id = $1", [order.id]).catch(() => {});
    await pool.query("delete from orders where id = $1", [order.id]).catch(() => {});
    await pool.query("update drivers set status = 'offline' where phone = $1", [DRIVER_PHONE]).catch(() => {});
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("DRIVER API SMOKE FAILED:", error);
  process.exitCode = 1;
});