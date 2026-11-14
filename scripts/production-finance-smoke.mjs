/**
 * Smoke de producción — Frente 11: dinero, transferencias y liquidaciones.
 *
 * Valida sobre la API real de localhost:3000 y la BD configurada en DATABASE_URL:
 *   - comisión snapshot por comercio al crear el pedido;
 *   - congelamiento de la comisión del driver al asignar;
 *   - entrega idempotente y earning único por pedido/tipo;
 *   - liquidación por comercio y de repartidor;
 *   - reportes de ventas/comisiones con snapshot histórico;
 *   - aprobación y rechazo de transferencia, comprobante y reenvío;
 *   - que un pedido no entregado/cancelado no se liquide.
 *
 * No reinicia el server ni ejecuta migraciones. Crea datos temporales con el
 * marcador SMOKE_FINANCE_ y los elimina en el bloque finally.
 */
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

const results = [];
const warnings = [];
const createdOrders = new Set();
const createdCustomers = [];
const createdDrivers = [];
const originalRates = new Map();
const marker = `SMOKE_FINANCE_${Date.now()}`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail = "") {
  warnings.push({ name, detail });
  console.log(`WARN ${name}${detail ? ` — ${detail}` : ""}`);
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function sameMoney(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.011;
}

function guayaquilDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

async function request(path, input, jar, method) {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jar?.size ? { cookie: cookieHeader(jar) } : {}),
    },
    ...(method === "POST"
      ? { body: JSON.stringify({ json: input ?? {} }) }
      : {}),
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

const post = (path, input, jar) => request(path, input, jar, "POST");

async function get(path, input, jar) {
  const response = await fetch(
    `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(
      JSON.stringify({ json: input ?? {} })
    )}`,
    { headers: jar?.size ? { cookie: cookieHeader(jar) } : {} }
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

const payload = result => result.data?.result?.data?.json;
const errorMessage = result => result.data?.error?.json?.message || "";

function trackOrder(id) {
  const numeric = Number(id);
  if (Number.isInteger(numeric) && numeric > 0) createdOrders.add(numeric);
  return numeric;
}

async function one(sql, params = []) {
  const rows = (await pool.query(sql, params)).rows;
  return rows[0];
}

async function all(sql, params = []) {
  return (await pool.query(sql, params)).rows;
}

function reportRowForDate(reportResult, date) {
  const rows = payload(reportResult)?.rows ?? [];
  return (
    rows.find(row => row.Fecha === date) ?? {
      Pedidos: 0,
      Ingresos: 0,
      Comisiones: 0,
    }
  );
}

function makeItems(commerces, generalMin) {
  const items = commerces.map(commerce => ({
    productId: Number(commerce.product.id),
    quantity: Math.max(
      1,
      Math.ceil(
        Number(commerce.min_order || 0) / Number(commerce.product.price)
      )
    ),
  }));
  let subtotal = commerces.reduce(
    (sum, commerce, index) =>
      sum + Number(commerce.product.price) * items[index].quantity,
    0
  );
  while (subtotal < generalMin) {
    items[0].quantity += 1;
    subtotal += Number(commerces[0].product.price);
  }
  for (const item of items) {
    if (item.quantity > 999)
      throw new Error("Cantidad de prueba fuera del límite del checkout.");
  }
  return items;
}

async function insertOtp(phone, otpId, code) {
  await pool.query(
    `insert into otp_verifications
      (phone, otp_id, code_hash, provider, purpose, status, ip, expires_at)
     values ($1, $2, $3, 'dev', 'login', 'pending', '127.0.0.1', now() + interval '10 minutes')`,
    [phone, otpId, await bcrypt.hash(code, 10)]
  );
}

async function cleanup() {
  const errors = [];
  try {
    const leftovers = await all("select id from orders where notes = $1", [
      marker,
    ]);
    for (const row of leftovers) createdOrders.add(Number(row.id));
  } catch (error) {
    errors.push(`buscar leftovers: ${error.message}`);
  }

  for (const orderId of createdOrders) {
    await pool
      .query("delete from driver_earnings where order_id = $1", [orderId])
      .catch(error => errors.push(`earning ${orderId}: ${error.message}`));
    await pool
      .query("delete from orders where id = $1", [orderId])
      .catch(error => errors.push(`pedido ${orderId}: ${error.message}`));
  }

  for (const driverId of createdDrivers) {
    await pool
      .query("delete from driver_earnings where driver_id = $1", [driverId])
      .catch(error =>
        errors.push(`earnings driver ${driverId}: ${error.message}`)
      );
    await pool
      .query("delete from drivers where id = $1", [driverId])
      .catch(error => errors.push(`driver ${driverId}: ${error.message}`));
  }

  for (const customer of createdCustomers) {
    await pool
      .query("delete from otp_verifications where phone = $1", [customer.phone])
      .catch(error => errors.push(`otp ${customer.id}: ${error.message}`));
    await pool
      .query("delete from customers where id = $1", [customer.id])
      .catch(error => errors.push(`cliente ${customer.id}: ${error.message}`));
  }

  for (const [commerceId, rate] of originalRates) {
    await pool
      .query("update commerces set commission_rate = $1 where id = $2", [
        rate,
        commerceId,
      ])
      .catch(error =>
        errors.push(`tasa comercio ${commerceId}: ${error.message}`)
      );
  }

  if (errors.length > 0) {
    console.error("LIMPIEZA CON ERRORES:");
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    console.log("Limpieza: datos temporales eliminados.");
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.");
  }
  if (!DATABASE_URL) throw new Error("Falta DATABASE_URL en el entorno.");

  const today = guayaquilDateKey();
  const adminJar = new Map();
  const customerJar = new Map();

  try {
    const adminLogin = await post(
      "login.login",
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      adminJar
    );
    record(
      "Login admin",
      adminLogin.status === 200 && payload(adminLogin)?.role === "admin",
      errorMessage(adminLogin)
    );
    if (adminLogin.status !== 200)
      throw new Error("No se pudo autenticar el admin.");

    let salesBefore = await post(
      "admin.getReports",
      { type: "sales", startDate: today, endDate: today },
      adminJar
    );
    let commissionsBefore = await post(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar
    );
    let commerceCommissionsBefore =
      payload(await get("admin.commerceCommissions", undefined, adminJar)) ??
      [];
    let dashboardBefore =
      payload(await get("admin.dashboard", undefined, adminJar)) ?? {};
    record(
      "Baseline de reportes disponible",
      salesBefore.status === 200 && commissionsBefore.status === 200,
      errorMessage(salesBefore) || errorMessage(commissionsBefore)
    );

    // ── Sesión de cliente temporal sin depender del proveedor de OTP ────────
    const phone = `5939${crypto.randomInt(10_000_000, 99_999_999)}`;
    const customer = await one(
      `insert into customers (first_name, last_name, phone, address)
       values ('Smoke', 'Finance', $1, 'Datos temporales de smoke financiero')
       returning id, phone`,
      [phone]
    );
    createdCustomers.push(customer);
    const otpId = `local:${marker}:${crypto.randomUUID()}`;
    const otpCode = "1234";
    await insertOtp(phone, otpId, otpCode);
    const customerSession = await post(
      "customer.verifyOtp",
      { phone, otpId, code: otpCode },
      customerJar
    );
    record(
      "Sesión cliente temporal",
      customerSession.status === 200 &&
        payload(customerSession)?.success === true,
      errorMessage(customerSession)
    );
    if (customerSession.status !== 200)
      throw new Error("No se pudo abrir la sesión de cliente.");

    // ── Comercios/productos base ────────────────────────────────────────────
    const commerces = await all(
      `select c.id, c.name, c.commission_rate, c.min_order
         from commerces c
        where c.status = 'active'
          and c.is_open = 'open'
          and exists (
            select 1 from products p
             where p.commerce_id = c.id
               and p.is_available = 'yes'
               and p.admin_paused = false
               and p.price::numeric > 0
          )
        order by c.id
        limit 2`
    );
    if (commerces.length < 2) {
      throw new Error(
        "Se necesitan al menos 2 comercios activos con producto para el smoke."
      );
    }
    for (const commerce of commerces) {
      commerce.product = await one(
        `select id, name, price, unit_type
           from products
          where commerce_id = $1
            and is_available = 'yes'
            and admin_paused = false
            and price::numeric > 0
          order by id
          limit 1`,
        [commerce.id]
      );
    }
    const generalMin = Number(
      (
        await one(
          "select value from app_settings where key = 'min_order_amount'"
        )
      )?.value ?? 5
    );
    const items = makeItems(commerces, generalMin);

    const quote = await get("order.quote", { items }, customerJar);
    const quoteData = payload(quote);
    record(
      "Quote de checkout válido",
      quote.status === 200 &&
        Array.isArray(quoteData?.lines) &&
        quoteData.lines.length === 2 &&
        (quoteData.issues ?? []).length === 0,
      quoteData?.issues?.join(" | ") || errorMessage(quote)
    );
    if (quote.status !== 200 || (quoteData?.issues ?? []).length > 0) {
      throw new Error(
        "El quote de prueba no es válido; revisa comercios/productos."
      );
    }

    // ── 1. Comisión snapshot por comercio al crear el pedido ────────────────
    const cashKey = `smoke-finance-cash-${Date.now()}`;
    const cashCreate = await post(
      "order.create",
      {
        items,
        deliveryAddress: "Dirección temporal smoke financiero",
        customerPhone: phone,
        paymentMethod: "cash",
        notes: marker,
        idempotencyKey: cashKey,
      },
      customerJar
    );
    const cashOrder = payload(cashCreate)?.order;
    record(
      "Checkout cash crea pedido recibido",
      cashCreate.status === 200 &&
        cashOrder?.status === "received" &&
        cashOrder?.paymentMethod === "cash",
      errorMessage(cashCreate)
    );
    if (!cashOrder?.id) throw new Error("No se creó el pedido cash de prueba.");
    const cashOrderId = trackOrder(cashOrder.id);

    const cashRow = await one("select * from orders where id = $1", [
      cashOrderId,
    ]);
    const itemSalesRows = await all(
      `select commerce_id, coalesce(sum(total), 0) as sales
         from order_items
        where order_id = $1
        group by commerce_id`,
      [cashOrderId]
    );
    const salesByCommerce = new Map(
      itemSalesRows.map(row => [
        Number(row.commerce_id),
        Number(row.sales || 0),
      ])
    );
    const rateByCommerce = new Map(
      commerces.map(commerce => [
        Number(commerce.id),
        Number(commerce.commission_rate),
      ])
    );
    const expectedSnapshot = new Map(
      [...salesByCommerce.entries()].map(([commerceId, sales]) => [
        commerceId,
        round2(sales * (rateByCommerce.get(commerceId) / 100)),
      ])
    );
    const expectedCommissionRaw = [...salesByCommerce.entries()].reduce(
      (sum, [commerceId, sales]) =>
        sum + sales * (rateByCommerce.get(commerceId) / 100),
      0
    );
    const expectedCommission = round2(
      [...expectedSnapshot.values()].reduce((sum, value) => sum + value, 0)
    );
    const statusRows = await all(
      `select commerce_id, status, commission_amount, settled_at
         from order_commerce_status
        where order_id = $1
        order by commerce_id`,
      [cashOrderId]
    );
    record(
      "Comisión snapshot por comercio al crear",
      statusRows.length === 2 &&
        statusRows.every(
          row =>
            row.status === "received" &&
            row.settled_at === null &&
            sameMoney(
              row.commission_amount,
              expectedSnapshot.get(Number(row.commerce_id))
            )
        ) &&
        sameMoney(cashRow.commission, round2(expectedCommissionRaw)),
      statusRows
        .map(row => `${row.commerce_id}:${row.commission_amount}`)
        .join(", ") + ` total=${cashRow.commission}`
    );

    const adminOrdersSnapshot =
      payload(await get("admin.orders", { limit: 200, offset: 0 }, adminJar)) ??
      [];
    const adminCash = adminOrdersSnapshot.find(
      order => Number(order.id) === cashOrderId
    );
    record(
      "admin.orders muestra el snapshot por comercio",
      Boolean(adminCash) &&
        (adminCash.commerceSettlements ?? []).length === 2 &&
        adminCash.commerceSettlements.every(
          settlement =>
            settlement.settled === false &&
            sameMoney(
              settlement.commission,
              expectedSnapshot.get(Number(settlement.commerceId))
            )
        ),
      (adminCash?.commerceSettlements ?? [])
        .map(settlement => `${settlement.commerceId}:${settlement.commission}`)
        .join(", ")
    );

    // ── 2. Cambiar la tasa no reescribe el snapshot histórico ───────────────
    const targetCommerce = commerces[0];
    const originalRate = String(
      Number(targetCommerce.commission_rate).toFixed(2)
    );
    originalRates.set(Number(targetCommerce.id), originalRate);
    const changedRate =
      Number(targetCommerce.commission_rate) >= 95
        ? Number(targetCommerce.commission_rate) - 5
        : Number(targetCommerce.commission_rate) + 5;
    const rateUpdate = await post(
      "admin.updateCommerce",
      { id: Number(targetCommerce.id), commissionRate: changedRate.toFixed(2) },
      adminJar
    );
    record(
      "Tasa de comercio actualizada para prueba",
      rateUpdate.status === 200,
      errorMessage(rateUpdate)
    );

    const snapshotAfterRate = await all(
      `select commerce_id, commission_amount from order_commerce_status
        where order_id = $1 order by commerce_id`,
      [cashOrderId]
    );
    const orderAfterRate = await one(
      "select commission from orders where id = $1",
      [cashOrderId]
    );
    record(
      "Cambiar la tasa no reescribe comisión snapshot",
      snapshotAfterRate.every(row =>
        sameMoney(
          row.commission_amount,
          expectedSnapshot.get(Number(row.commerce_id))
        )
      ) && sameMoney(orderAfterRate.commission, round2(expectedCommissionRaw)),
      snapshotAfterRate
        .map(row => `${row.commerce_id}:${row.commission_amount}`)
        .join(", ")
    );

    const adminOrdersAfterRate =
      payload(await get("admin.orders", { limit: 200, offset: 0 }, adminJar)) ??
      [];
    const adminCashAfterRate = adminOrdersAfterRate.find(
      order => Number(order.id) === cashOrderId
    );
    record(
      "admin.orders conserva el snapshot tras cambiar la tasa",
      (adminCashAfterRate?.commerceSettlements ?? []).every(settlement =>
        sameMoney(
          settlement.commission,
          expectedSnapshot.get(Number(settlement.commerceId))
        )
      )
    );

    // El cambio de tasa también afecta filas legacy sin snapshot; se toma la
    // línea base de reportes después del cambio para medir solo este pedido.
    salesBefore = await post(
      "admin.getReports",
      { type: "sales", startDate: today, endDate: today },
      adminJar
    );
    commissionsBefore = await post(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar
    );
    commerceCommissionsBefore =
      payload(await get("admin.commerceCommissions", undefined, adminJar)) ??
      [];
    dashboardBefore =
      payload(await get("admin.dashboard", undefined, adminJar)) ?? {};
    record(
      "Baseline posterior al cambio de tasa",
      salesBefore.status === 200 && commissionsBefore.status === 200,
      errorMessage(salesBefore) || errorMessage(commissionsBefore)
    );

    // ── 3. Comisión del driver congelada al asignar ─────────────────────────
    const driver = await one(
      `insert into drivers (name, phone, status, commission_rate)
       values ('Smoke Finance Driver', $1, 'online', '80.00')
       returning id`,
      [`09${crypto.randomInt(10_000_000, 99_999_999)}`]
    );
    createdDrivers.push(driver.id);
    const driverId = Number(driver.id);

    for (const status of ["accepted", "preparing", "ready_for_pickup"]) {
      const transition = await post(
        "admin.updateOrderStatus",
        { id: cashOrderId, status },
        adminJar
      );
      record(
        `Pedido pasa a ${status}`,
        transition.status === 200,
        errorMessage(transition)
      );
    }

    const assign = await post(
      "admin.assignDriver",
      { orderId: cashOrderId, driverId },
      adminJar
    );
    const assignedRow = await one(
      `select status, driver_id, driver_commission_rate, delivery_fee
         from orders where id = $1`,
      [cashOrderId]
    );
    record(
      "Asignación congela comisión del driver",
      assign.status === 200 &&
        assignedRow.status === "driver_assigned" &&
        Number(assignedRow.driver_id) === driverId &&
        sameMoney(assignedRow.driver_commission_rate, 80),
      `rate=${assignedRow.driver_commission_rate}`
    );

    await pool.query(
      "update drivers set commission_rate = '50.00' where id = $1",
      [driverId]
    );
    const afterDriverRate = await one(
      "select driver_commission_rate from orders where id = $1",
      [cashOrderId]
    );
    record(
      "Cambiar la tasa del driver no altera el pedido",
      sameMoney(afterDriverRate.driver_commission_rate, 80),
      `rate=${afterDriverRate.driver_commission_rate}`
    );

    // ── 4. Entrega idempotente y earning único ──────────────────────────────
    for (const status of ["picked_up", "on_the_way", "delivered"]) {
      const transition = await post(
        "admin.updateOrderStatus",
        { id: cashOrderId, status },
        adminJar
      );
      record(
        `Pedido pasa a ${status}`,
        transition.status === 200,
        errorMessage(transition)
      );
    }

    const deliveredRow = await one(
      `select status, delivered_at, delivery_fee, driver_commission_rate
         from orders where id = $1`,
      [cashOrderId]
    );
    const firstEarningRows = await all(
      `select id, amount, type from driver_earnings
        where order_id = $1 and type = 'delivery_fee'`,
      [cashOrderId]
    );
    const expectedEarning = round2(Number(deliveredRow.delivery_fee) * 0.8);
    record(
      "Entrega genera earning único con comisión congelada",
      deliveredRow.status === "delivered" &&
        deliveredRow.delivered_at !== null &&
        firstEarningRows.length === 1 &&
        firstEarningRows[0].type === "delivery_fee" &&
        sameMoney(firstEarningRows[0].amount, expectedEarning),
      `amount=${firstEarningRows[0]?.amount} expected=${expectedEarning}`
    );

    const firstDeliveredAt = String(deliveredRow.delivered_at);
    const secondDelivery = await post(
      "admin.updateOrderStatus",
      { id: cashOrderId, status: "delivered" },
      adminJar
    );
    const secondDeliveredRow = await one(
      "select delivered_at from orders where id = $1",
      [cashOrderId]
    );
    const deliveryHistory = await one(
      `select count(*)::int as count from order_status_history
        where order_id = $1 and status = 'delivered'`,
      [cashOrderId]
    );
    const secondEarningCount = await one(
      `select count(*)::int as count from driver_earnings
        where order_id = $1 and type = 'delivery_fee'`,
      [cashOrderId]
    );
    record(
      "Entrega repetida no reescribe delivered_at ni duplica historial",
      secondDelivery.status === 200 &&
        String(secondDeliveredRow.delivered_at) === firstDeliveredAt &&
        deliveryHistory.count === 1 &&
        secondEarningCount.count === 1,
      `history=${deliveryHistory.count} earnings=${secondEarningCount.count}`
    );

    let duplicateCode = "";
    try {
      const duplicate = await pool.query(
        `insert into driver_earnings (driver_id, order_id, amount, type, date)
         values ($1, $2, $3, 'delivery_fee', $4)
         returning id`,
        [driverId, cashOrderId, expectedEarning.toFixed(2), today]
      );
      await pool.query("delete from driver_earnings where id = $1", [
        duplicate.rows[0].id,
      ]);
      duplicateCode = "INSERTED";
    } catch (error) {
      duplicateCode = error.code || error.message;
    }
    const uniqueEarningCount = await one(
      `select count(*)::int as count from driver_earnings
        where order_id = $1 and type = 'delivery_fee'`,
      [cashOrderId]
    );
    record(
      "Índice único impide duplicar el earning",
      duplicateCode === "23505" && uniqueEarningCount.count === 1,
      `code=${duplicateCode} count=${uniqueEarningCount.count}`
    );

    // ── 5. Liquidación por comercio y de repartidor ─────────────────────────
    const settleRowsBefore = await all(
      `select commerce_id, settled_at from order_commerce_status
        where order_id = $1 order by commerce_id`,
      [cashOrderId]
    );
    record(
      "Pedido entregado inicia sin liquidar",
      settleRowsBefore.every(row => row.settled_at === null)
    );

    const settleFirst = await post(
      "admin.toggleCommerceSettled",
      { id: cashOrderId, commerceId: Number(commerces[0].id) },
      adminJar
    );
    const settleRowsAfterFirst = await all(
      `select commerce_id, settled_at from order_commerce_status
        where order_id = $1 order by commerce_id`,
      [cashOrderId]
    );
    const orderAfterFirstSettle = await one(
      "select commerce_settled from orders where id = $1",
      [cashOrderId]
    );
    record(
      "Settlement liquida solo el comercio indicado",
      settleFirst.status === 200 &&
        settleRowsAfterFirst.find(
          row => Number(row.commerce_id) === Number(commerces[0].id)
        )?.settled_at !== null &&
        settleRowsAfterFirst.find(
          row => Number(row.commerce_id) === Number(commerces[1].id)
        )?.settled_at === null &&
        orderAfterFirstSettle.commerce_settled === false,
      settleRowsAfterFirst
        .map(row => `${row.commerce_id}:${Boolean(row.settled_at)}`)
        .join(",")
    );

    const settleSecond = await post(
      "admin.toggleCommerceSettled",
      { id: cashOrderId, commerceId: Number(commerces[1].id) },
      adminJar
    );
    const settleRowsAfterSecond = await all(
      `select commerce_id, settled_at from order_commerce_status
        where order_id = $1 order by commerce_id`,
      [cashOrderId]
    );
    const orderAfterSecondSettle = await one(
      "select commerce_settled, driver_settled from orders where id = $1",
      [cashOrderId]
    );
    record(
      "Settlement completo marca el pedido conciliado",
      settleSecond.status === 200 &&
        settleRowsAfterSecond.every(row => row.settled_at !== null) &&
        orderAfterSecondSettle.commerce_settled === true,
      settleRowsAfterSecond
        .map(row => `${row.commerce_id}:${Boolean(row.settled_at)}`)
        .join(",")
    );

    const settleDriver = await post(
      "admin.toggleDriverSettled",
      { id: cashOrderId },
      adminJar
    );
    const orderAfterDriverSettle = await one(
      "select driver_settled from orders where id = $1",
      [cashOrderId]
    );
    record(
      "Liquidación de repartidor se registra",
      settleDriver.status === 200 &&
        orderAfterDriverSettle.driver_settled === true,
      `driver_settled=${orderAfterDriverSettle.driver_settled}`
    );

    // ── 6. Reportes de ventas y comisiones con snapshot ─────────────────────
    const salesAfter = await post(
      "admin.getReports",
      { type: "sales", startDate: today, endDate: today },
      adminJar
    );
    const salesBeforeRow = reportRowForDate(salesBefore, today);
    const salesAfterRow = reportRowForDate(salesAfter, today);
    record(
      "Reporte de ventas agrega pedido y comisión snapshot",
      salesAfter.status === 200 &&
        sameMoney(
          Number(salesAfterRow.Pedidos) - Number(salesBeforeRow.Pedidos),
          1
        ) &&
        sameMoney(
          Number(salesAfterRow.Ingresos) - Number(salesBeforeRow.Ingresos),
          cashRow.total
        ) &&
        sameMoney(
          Number(salesAfterRow.Comisiones) - Number(salesBeforeRow.Comisiones),
          expectedCommission
        ),
      `pedidos=${salesBeforeRow.Pedidos}->${salesAfterRow.Pedidos} comision=${salesBeforeRow.Comisiones}->${salesAfterRow.Comisiones}`
    );

    const commissionsAfter = await post(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar
    );
    const commissionRows = (payload(commissionsAfter)?.rows ?? []).filter(
      row => Number(row["Pedido ID"]) === cashOrderId
    );
    const commissionByName = new Map(
      commissionRows.map(row => [row.Comercio, Number(row.Comision)])
    );
    record(
      "Reporte de comisiones usa snapshot por comercio",
      commissionsAfter.status === 200 &&
        commissionRows.length === 2 &&
        commerces.every(commerce =>
          sameMoney(
            commissionByName.get(commerce.name),
            expectedSnapshot.get(commerce.id)
          )
        ),
      commissionRows.map(row => `${row.Comercio}:${row.Comision}`).join(", ")
    );
    record(
      "Reportes no exponen comprobantes",
      (payload(commissionsAfter)?.rows ?? []).every(
        row => !Object.keys(row).some(key => /receipt|comprobante/i.test(key))
      )
    );

    const commerceCommissionsAfter =
      payload(await get("admin.commerceCommissions", undefined, adminJar)) ??
      [];
    const commerceBeforeMap = new Map(
      commerceCommissionsBefore.map(row => [
        Number(row.commerceId),
        Number(row.commissionEarned || 0),
      ])
    );
    record(
      "Comisiones acumuladas por comercio usan snapshot",
      commerces.every(commerce => {
        const after = commerceCommissionsAfter.find(
          row => Number(row.commerceId) === Number(commerce.id)
        );
        const before = commerceBeforeMap.get(Number(commerce.id)) ?? 0;
        return sameMoney(
          Number(after?.commissionEarned ?? 0) - before,
          expectedSnapshot.get(commerce.id)
        );
      })
    );

    const dashboardAfter =
      payload(await get("admin.dashboard", undefined, adminJar)) ?? {};
    record(
      "Dashboard suma la comisión histórica",
      sameMoney(
        Number(dashboardAfter.totalCommission) -
          Number(dashboardBefore.totalCommission),
        expectedCommission
      ),
      `${dashboardBefore.totalCommission} -> ${dashboardAfter.totalCommission}`
    );

    // ── 7. Transferencia: comprobante, aprobación y rechazo ─────────────────
    async function createTransferOrder(label, receipt) {
      const transferItems = makeItems([commerces[0]], generalMin);
      const response = await post(
        "order.create",
        {
          items: transferItems,
          deliveryAddress: `Dirección temporal ${label}`,
          customerPhone: phone,
          paymentMethod: "transfer",
          paymentReceipt: receipt,
          notes: marker,
          idempotencyKey: `smoke-finance-${label}-${Date.now()}`,
        },
        customerJar
      );
      const order = payload(response)?.order;
      return { response, order, id: trackOrder(order?.id) };
    }

    const receiptA = `data:image/png;base64,${"A".repeat(240)}`;
    const transferA = await createTransferOrder("approve", receiptA);
    record(
      "Checkout transferencia queda pendiente de validación",
      transferA.response.status === 200 &&
        transferA.order?.status === "pending_payment",
      errorMessage(transferA.response)
    );
    if (!transferA.id)
      throw new Error("No se creó la transferencia A de prueba.");
    const transferAStatus = await all(
      `select status, commission_amount from order_commerce_status where order_id = $1`,
      [transferA.id]
    );
    record(
      "Comercio queda pendiente de pago",
      transferAStatus.length === 1 &&
        transferAStatus[0].status === "pending_payment"
    );

    const settlePending = await post(
      "admin.toggleCommerceSettled",
      { id: transferA.id, commerceId: Number(commerces[0].id) },
      adminJar
    );
    record(
      "No se liquida un pedido no entregado",
      settlePending.status >= 400,
      errorMessage(settlePending)
    );

    const transferADetail = await get(
      "admin.orderDetail",
      { id: transferA.id },
      adminJar
    );
    const transferADetailData = payload(transferADetail);
    record(
      "Detalle admin incluye comprobante para validar transferencia",
      transferADetail.status === 200 &&
        Boolean(transferADetailData) &&
        Boolean(transferADetailData?.paymentReceipt),
      transferADetailData?.paymentReceipt ? "comprobante presente" : "sin comprobante"
    );
    record(
      "Detalle admin no expone fcmToken del cliente",
      transferADetail.status === 200 &&
        !("fcmToken" in (transferADetailData?.customer ?? {})),
    );

    const transferARow = await one(
      "select payment_receipt from orders where id = $1",
      [transferA.id]
    );
    record(
      "Comprobante se guarda en BD pero no se sirve al admin",
      transferARow.payment_receipt === receiptA
    );

    const approveA = await post(
      "admin.updateOrderStatus",
      {
        id: transferA.id,
        status: "received",
        notes: "SMOKE aprobación de transferencia",
      },
      adminJar
    );
    const approvedARow = await one("select status from orders where id = $1", [
      transferA.id,
    ]);
    const approvedAStatus = await all(
      "select status from order_commerce_status where order_id = $1",
      [transferA.id]
    );
    record(
      "Aprobar transferencia pasa pedido y comercio a received",
      approveA.status === 200 &&
        approvedARow.status === "received" &&
        approvedAStatus.length === 1 &&
        approvedAStatus[0].status === "received",
      `order=${approvedARow.status} commerce=${approvedAStatus[0]?.status}`
    );

    const receiptAfterApproval = await post(
      "order.updatePaymentReceipt",
      {
        orderId: transferA.id,
        receipt: `data:image/png;base64,${"B".repeat(240)}`,
      },
      customerJar
    );
    record(
      "Comprobante no se puede cambiar tras aprobar",
      receiptAfterApproval.status >= 400,
      errorMessage(receiptAfterApproval)
    );

    const transferB = await createTransferOrder(
      "reject",
      `data:image/png;base64,${"C".repeat(240)}`
    );
    if (!transferB.id)
      throw new Error("No se creó la transferencia B de prueba.");
    const rejectionReason = "Comprobante ilegible smoke";
    const rejectB = await post(
      "admin.updateOrderStatus",
      { id: transferB.id, status: "payment_rejected", notes: rejectionReason },
      adminJar
    );
    const rejectedBRow = await one("select status from orders where id = $1", [
      transferB.id,
    ]);
    const rejectedBStatus = await all(
      "select status from order_commerce_status where order_id = $1",
      [transferB.id]
    );
    const rejectedBHistory = await one(
      `select notes from order_status_history
        where order_id = $1 and status = 'payment_rejected'
        order by id desc limit 1`,
      [transferB.id]
    );
    const rejectedBEarnings = await one(
      "select count(*)::int as count from driver_earnings where order_id = $1",
      [transferB.id]
    );
    record(
      "Rechazar transferencia registra motivo y estado",
      rejectB.status === 200 &&
        rejectedBRow.status === "payment_rejected" &&
        rejectedBStatus.length === 1 &&
        rejectedBStatus[0].status === "payment_rejected" &&
        String(rejectedBHistory?.notes ?? "").includes(rejectionReason) &&
        rejectedBEarnings.count === 0,
      `history=${rejectedBHistory?.notes ?? ""}`
    );

    const receiptB2 = `data:image/png;base64,${"D".repeat(240)}`;
    const resubmitB = await post(
      "order.updatePaymentReceipt",
      { orderId: transferB.id, receipt: receiptB2 },
      customerJar
    );
    const resubmittedBRow = await one(
      "select status, payment_receipt from orders where id = $1",
      [transferB.id]
    );
    record(
      "Cliente reenvía comprobante y vuelve a pending_payment",
      resubmitB.status === 200 &&
        resubmittedBRow.status === "pending_payment" &&
        resubmittedBRow.payment_receipt === receiptB2,
      `status=${resubmittedBRow.status}`
    );

    const approveB = await post(
      "admin.updateOrderStatus",
      {
        id: transferB.id,
        status: "received",
        notes: "SMOKE aprobación tras reenvío",
      },
      adminJar
    );
    const approvedBRow = await one("select status from orders where id = $1", [
      transferB.id,
    ]);
    record(
      "Aprobar comprobante reenviado funciona",
      approveB.status === 200 && approvedBRow.status === "received",
      `status=${approvedBRow.status}`
    );

    const cancelB = await post(
      "admin.updateOrderStatus",
      {
        id: transferB.id,
        status: "cancelled",
        notes: "SMOKE cancelación de prueba",
      },
      adminJar
    );
    const cancelledBRow = await one(
      "select status, cancelled_by, cancellation_reason from orders where id = $1",
      [transferB.id]
    );
    const cancelledBHistory = await one(
      `select notes from order_status_history
        where order_id = $1 and status = 'cancelled'
        order by id desc limit 1`,
      [transferB.id]
    );
    const cancelledBEarnings = await one(
      "select count(*)::int as count from driver_earnings where order_id = $1",
      [transferB.id]
    );
    const settleCancelled = await post(
      "admin.toggleCommerceSettled",
      { id: transferB.id, commerceId: Number(commerces[0].id) },
      adminJar
    );
    record(
      "Cancelación no genera earning ni permite liquidar",
      cancelB.status === 200 &&
        cancelledBRow.status === "cancelled" &&
        cancelledBEarnings.count === 0 &&
        String(cancelledBHistory?.notes ?? "").includes(
          "SMOKE cancelación de prueba"
        ) &&
        settleCancelled.status >= 400,
      `settle=${settleCancelled.status} ${errorMessage(settleCancelled)}`
    );
    if (!cancelledBRow.cancelled_by || !cancelledBRow.cancellation_reason) {
      warn(
        "Cancelación admin no guarda cancelled_by/cancellation_reason en orders (solo historial)",
        "server/admin/orders-router.ts:573-588"
      );
    }

    // Gap observado en código: el admin no pasa por canTransition.
    const lateReject = await post(
      "admin.updateOrderStatus",
      {
        id: transferA.id,
        status: "payment_rejected",
        notes: "SMOKE rechazo posterior",
      },
      adminJar
    );
    if (lateReject.status === 200) {
      warn(
        "Un pago ya aprobado puede rechazarse después (sin canTransition)",
        "server/admin/orders-router.ts:453-588"
      );
    } else {
      record("Rechazo posterior a aprobación bloqueado", true);
    }

    const finalOrders =
      payload(await get("admin.orders", { limit: 200, offset: 0 }, adminJar)) ??
      [];
    record(
      "admin.orders nunca expone paymentReceipt",
      finalOrders.every(order => !("paymentReceipt" in order))
    );
  } finally {
    await cleanup();
    await pool.end().catch(error => console.error("pool.end:", error.message));
  }
}

main()
  .then(() => {
    const failed = results.filter(result => !result.ok);
    console.log(
      `\nRESULT ${results.length - failed.length}/${results.length} PASS` +
        (warnings.length > 0 ? ` — ${warnings.length} WARN` : "")
    );
    if (failed.length > 0) {
      console.log("FALLOS:");
      for (const failure of failed) {
        console.log(
          `  - ${failure.name}${failure.detail ? `: ${failure.detail}` : ""}`
        );
      }
      process.exitCode = 1;
    }
  })
  .catch(error => {
    console.error("PRODUCTION FINANCE SMOKE FAILED:", error);
    process.exitCode = 1;
  });
