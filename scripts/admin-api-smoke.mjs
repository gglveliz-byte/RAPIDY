import "dotenv/config";
import pg from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
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
const errorMessage = (result) => result.data?.error?.json?.message || "";

async function insertOrder(pool, options = {}) {
  const {
    status = "ready_for_pickup",
    commerces = [1],
    deliveredAt = null,
    driverId = null,
    pickedUpCommerceIds = [],
  } = options;
  const customer = (
    await pool.query("select id, phone from customers order by id limit 1")
  ).rows[0];
  const productRows = [];
  for (const commerceId of commerces) {
    const product = (
      await pool.query(
        "select id, name, price from products where commerce_id = $1 order by id limit 1",
        [commerceId],
      )
    ).rows[0];
    if (!product) throw new Error(`No hay producto para el comercio ${commerceId}`);
    productRows.push({ commerceId, product });
  }
  const subtotal = productRows.length * 10;
  const deliveryFee = 2.5;
  const total = subtotal + deliveryFee;
  const order = (
    await pool.query(
      `insert into orders
        (customer_id, driver_id, picked_up_commerce_ids, status, subtotal, delivery_fee, commission, total, payment_method, delivery_address, customer_phone, delivered_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'cash', 'Dirección smoke admin', $9, $10)
       returning id`,
      [
        customer.id,
        driverId,
        pickedUpCommerceIds,
        status,
        subtotal.toFixed(2),
        deliveryFee.toFixed(2),
        "1.00",
        total.toFixed(2),
        customer.phone,
        deliveredAt,
      ],
    )
  ).rows[0];

  for (const { commerceId, product } of productRows) {
    await pool.query(
      `insert into order_items
        (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
       values ($1, $2, $3, $4, '1', $5, '10.00')`,
      [order.id, product.id, commerceId, product.name, product.price],
    );
    await pool.query(
      `insert into order_commerce_status
        (order_id, commerce_id, status, commission_amount, settled_at)
       values ($1, $2, $3, '1.00', $4)`,
      [
        order.id,
        commerceId,
        ["delivered", "on_the_way"].includes(status) ? "picked_up" : status,
        null,
      ],
    );
  }

  return order.id;
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adminJar = new Map();
  const createdOrders = [];
  const createdMerchantIds = [];
  let originalCommerceRate = "10.00";
  let originalProductState = null;
  let originalDriverStatus = "online";
  let originalSettings = {};

  try {
    const login = await post(
      "login.login",
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      adminJar,
    );
    record("Login admin", login.status === 200 && payload(login)?.role === "admin");

    // Sesión admin revocable
    const logoutJar = new Map();
    await post("login.login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, logoutJar);
    const oldCookie = cookieHeader(logoutJar);
    const logout = await post("login.logout", { scope: "admin" }, logoutJar);
    const oldCheckResponse = await fetch(
      `${BASE_URL}/api/trpc/login.checkAuth?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
      { headers: { cookie: oldCookie } },
    );
    const oldCheck = await oldCheckResponse.json();
    const oldRefreshResponse = await fetch(`${BASE_URL}/api/trpc/login.refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: oldCookie },
      body: JSON.stringify({ json: {} }),
    });
    const oldRefresh = await oldRefreshResponse.json();
    record(
      "Logout admin revoca refresh anterior",
      logout.status === 200 &&
        oldCheck?.result?.data?.json?.authenticated === false &&
        oldRefresh?.result?.data?.json?.success === false,
    );

    // El logout revoca todas las sesiones del admin; se vuelve a iniciar para
    // continuar con las pruebas autenticadas.
    adminJar.clear();
    const relogin = await post(
      "login.login",
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      adminJar,
    );
    record("Re-login admin tras revocación", relogin.status === 200);

    const settings = await get("admin.settings", undefined, adminJar);
    const settingRows = payload(settings) ?? [];
    originalSettings = Object.fromEntries(
      settingRows.map((row) => [row.key, row.value ?? ""]),
    );

    const invalidFee = await post(
      "admin.updateSetting",
      { key: "delivery_fee", value: "-1" },
      adminJar,
    );
    record("Settings rechaza envío negativo", invalidFee.status >= 400);
    const invalidComma = await post(
      "admin.updateSetting",
      { key: "delivery_fee", value: "2,50" },
      adminJar,
    );
    record("Settings rechaza coma decimal", invalidComma.status >= 400);
    const validFee = await post(
      "admin.updateSetting",
      { key: "delivery_fee", value: "2.50" },
      adminJar,
    );
    record("Settings acepta decimal válido", validFee.status === 200);

    const unknownKey = await post(
      "admin.updateSetting",
      { key: "commission_rate", value: "50" },
      adminJar,
    );
    record("Settings rechaza clave desconocida", unknownKey.status >= 400);

    // Listado admin sin comprobantes y paginado
    const list = await get("admin.orders", { limit: 100, offset: 0 }, adminJar);
    const orders = payload(list) ?? [];
    record("admin.orders responde paginado", list.status === 200 && Array.isArray(orders));
    record(
      "admin.orders no expone paymentReceipt",
      orders.length === 0 || orders.every((order) => !("paymentReceipt" in order)),
    );

    // Dato base de comisión
    const commerce = (
      await pool.query(
        "select id, commission_rate from commerces where id = 1",
      )
    ).rows[0];
    originalCommerceRate = commerce.commission_rate;

    const commissionsBefore = payload(
      await get("admin.commerceCommissions", undefined, adminJar),
    ) ?? [];
    const beforeCommission =
      Number(
        commissionsBefore.find((row) => Number(row.commerceId) === 1)?.commissionEarned ?? 0,
      );
    const dashboardBefore = payload(await get("admin.dashboard", undefined, adminJar));

    const commissionOrderId = await insertOrder(pool, {
      status: "delivered",
      commerces: [1],
      deliveredAt: new Date().toISOString(),
    });
    createdOrders.push(commissionOrderId);

    const commissionsAfter = payload(
      await get("admin.commerceCommissions", undefined, adminJar),
    ) ?? [];
    const afterCommission =
      Number(
        commissionsAfter.find((row) => Number(row.commerceId) === 1)?.commissionEarned ?? 0,
      );
    record(
      "Comisión snapshot suma el monto histórico",
      Math.abs(afterCommission - beforeCommission - 1) < 0.01,
      `${beforeCommission} -> ${afterCommission}`,
    );

    const detailList = payload(
      await get("admin.orders", { limit: 100, offset: 0 }, adminJar),
    ) ?? [];
    const snapshotOrder = detailList.find((order) => order.id === commissionOrderId);
    record(
      "admin.orders muestra comisión snapshot",
      Number(snapshotOrder?.commerceSettlements?.[0]?.commission ?? 0) === 1,
      String(snapshotOrder?.commerceSettlements?.[0]?.commission),
    );

    await post(
      "admin.updateCommerce",
      { id: 1, commissionRate: "20.00" },
      adminJar,
    );
    const commissionsAfterRateChange = payload(
      await get("admin.commerceCommissions", undefined, adminJar),
    ) ?? [];
    const afterRateCommission =
      Number(
        commissionsAfterRateChange.find((row) => Number(row.commerceId) === 1)
          ?.commissionEarned ?? 0,
      );
    const dashboardAfterRateChange = payload(
      await get("admin.dashboard", undefined, adminJar),
    );
    record(
      "Cambiar tasa no reescribe comisión histórica",
      Math.abs(afterRateCommission - afterCommission) < 0.01,
      `${afterCommission} -> ${afterRateCommission}`,
    );
    record(
      "Dashboard conserva comisión histórica",
      Math.abs(
        Number(dashboardBefore?.totalCommission ?? 0) -
          (Number(dashboardAfterRateChange?.totalCommission ?? 0) - 1),
      ) < 0.01,
      `${dashboardBefore?.totalCommission} -> ${dashboardAfterRateChange?.totalCommission}`,
    );

    // Settlement multi-comercio
    const multiOrderId = await insertOrder(pool, {
      status: "delivered",
      commerces: [1, 2],
      deliveredAt: new Date().toISOString(),
    });
    createdOrders.push(multiOrderId);
    const settleOne = await post(
      "admin.toggleCommerceSettled",
      { id: multiOrderId, commerceId: 1 },
      adminJar,
    );
    const settleRows = (
      await pool.query(
        "select commerce_id, settled_at from order_commerce_status where order_id = $1 order by commerce_id",
        [multiOrderId],
      )
    ).rows;
    record(
      "Settlement liquida solo un comercio",
      settleOne.status === 200 &&
        settleRows[0].settled_at !== null &&
        settleRows[1].settled_at === null,
      settleRows.map((row) => `${row.commerce_id}:${Boolean(row.settled_at)}`).join(","),
    );
    const orderAfterSettle = (
      await pool.query("select commerce_settled from orders where id = $1", [multiOrderId])
    ).rows[0];
    record("Pedido multi-comercio queda pendiente", orderAfterSettle.commerce_settled === false);

    // Entrega repetida idempotente
    const deliveryOrderId = await insertOrder(pool, {
      status: "on_the_way",
      commerces: [1],
      pickedUpCommerceIds: [1],
    });
    createdOrders.push(deliveryOrderId);
    const firstDelivery = await post(
      "admin.updateOrderStatus",
      { id: deliveryOrderId, status: "delivered" },
      adminJar,
    );
    const firstDeliveredAt = (
      await pool.query("select delivered_at from orders where id = $1", [deliveryOrderId])
    ).rows[0].delivered_at;
    const secondDelivery = await post(
      "admin.updateOrderStatus",
      { id: deliveryOrderId, status: "delivered" },
      adminJar,
    );
    const secondDeliveredAt = (
      await pool.query("select delivered_at from orders where id = $1", [deliveryOrderId])
    ).rows[0].delivered_at;
    const deliveryHistory = (
      await pool.query(
        "select count(*)::int as count from order_status_history where order_id = $1 and status = 'delivered'",
        [deliveryOrderId],
      )
    ).rows[0].count;
    record(
      "Entrega repetida no reescribe delivered_at",
      firstDelivery.status === 200 &&
        secondDelivery.status === 200 &&
        String(firstDeliveredAt) === String(secondDeliveredAt) &&
        deliveryHistory === 1,
      `${firstDeliveredAt} / ${secondDeliveredAt} / history=${deliveryHistory}`,
    );

    // La comisión del driver se congela al asignar, no al entregar.
    const driverCommissionOrderId = await insertOrder(pool, {
      status: "on_the_way",
      commerces: [1],
      driverId: 1,
      pickedUpCommerceIds: [1],
    });
    createdOrders.push(driverCommissionOrderId);
    await pool.query(
      "update orders set driver_commission_rate = '75.00' where id = $1",
      [driverCommissionOrderId],
    );
    const driverRateRow = (
      await pool.query("select commission_rate from drivers where id = 1")
    ).rows[0];
    await pool.query("update drivers set commission_rate = '50.00' where id = 1");
    const driverCommissionDelivery = await post(
      "admin.updateOrderStatus",
      { id: driverCommissionOrderId, status: "delivered" },
      adminJar,
    );
    const driverCommissionEarning = (
      await pool.query(
        "select amount from driver_earnings where order_id = $1 and type = 'delivery_fee'",
        [driverCommissionOrderId],
      )
    ).rows[0];
    await pool.query("update drivers set commission_rate = $1 where id = 1", [
      driverRateRow.commission_rate,
    ]);
    record(
      "Ganancia usa comisión congelada al asignar",
      driverCommissionDelivery.status === 200 &&
        Number(driverCommissionEarning?.amount) === 1.88,
      driverCommissionEarning?.amount,
    );

    // Asignación a driver offline
    const driverRow = (
      await pool.query("select id, status from drivers order by id limit 1")
    ).rows[0];
    originalDriverStatus = driverRow.status;
    await pool.query("update drivers set status = 'offline' where id = $1", [driverRow.id]);
    const assignOrderId = await insertOrder(pool, { status: "ready_for_pickup", commerces: [1] });
    createdOrders.push(assignOrderId);
    const offlineAssign = await post(
      "admin.assignDriver",
      { orderId: assignOrderId, driverId: driverRow.id },
      adminJar,
    );
    record(
      "No asigna repartidor offline",
      offlineAssign.status >= 400,
      errorMessage(offlineAssign),
    );
    await pool.query("update drivers set status = $1 where id = $2", [
      originalDriverStatus,
      driverRow.id,
    ]);

    // Producto pausado por admin no puede reactivarse por merchant
    const product = (
      await pool.query("select id, is_available, admin_paused from products order by id limit 1")
    ).rows[0];
    originalProductState = product;
    const pause = await post(
      "admin.toggleProductAvailability",
      { id: product.id },
      adminJar,
    );
    const merchantJar = new Map();
    await post(
      "login.login",
      { email: MERCHANT_EMAIL, password: MERCHANT_PASSWORD },
      merchantJar,
    );
    const merchantReactivate = await post(
      "product.update",
      { id: product.id, isAvailable: "yes" },
      merchantJar,
    );
    record(
      "Merchant no revierte pausa admin",
      pause.status === 200 && merchantReactivate.status >= 400,
      errorMessage(merchantReactivate),
    );
    await post("admin.toggleProductAvailability", { id: product.id }, adminJar);

    // Alta de merchant normaliza email y bloquea activación incompleta
    const email = `SmokeAdmin${Date.now()}@Example.com`;
    const created = await post(
      "admin.createMerchant",
      { name: "Smoke Admin", email, password: "Test12345", categoryId: 1 },
      adminJar,
    );
    const createdUser = payload(created);
    if (createdUser?.id) createdMerchantIds.push(createdUser.id);
    record(
      "Alta merchant normaliza email",
      created.status === 200 && createdUser?.email === email.toLowerCase(),
      createdUser?.email,
    );
    const createdCommerce = (
      await pool.query(
        "select id from commerces where merchant_user_id = $1 order by id desc limit 1",
        [createdUser?.id],
      )
    ).rows[0];
    const activateIncomplete = await post(
      "admin.updateCommerce",
      { id: createdCommerce?.id, status: "active" },
      adminJar,
    );
    record(
      "No activa comercio incompleto",
      activateIncomplete.status >= 400,
      errorMessage(activateIncomplete),
    );

    // Reportes sin comprobantes y con filtro de fechas
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const report = await post(
      "admin.getReports",
      { type: "orders", startDate: today, endDate: today },
      adminJar,
    );
    const reportRows = payload(report)?.rows ?? [];
    record(
      "Reporte de pedidos sin comprobantes",
      report.status === 200 &&
        (reportRows.length === 0 ||
          reportRows.every((row) => !("paymentReceipt" in row))),
    );
    const earningsReport = await post(
      "admin.getReports",
      { type: "earnings", startDate: today, endDate: today },
      adminJar,
    );
    record("Reporte de ganancias responde", earningsReport.status === 200);

    const salesReport = await post(
      "admin.getReports",
      { type: "sales", startDate: today, endDate: today },
      adminJar,
    );
    record(
      "Reporte de ventas responde",
      salesReport.status === 200 && Array.isArray(payload(salesReport)?.rows),
    );
    const commissionsReport = await post(
      "admin.getReports",
      { type: "commissions", startDate: today, endDate: today },
      adminJar,
    );
    record(
      "Reporte de comisiones responde",
      commissionsReport.status === 200 && Array.isArray(payload(commissionsReport)?.rows),
    );

    const salesSeries = await get(
      "admin.salesByPeriod",
      { period: "day" },
      adminJar,
    );
    record(
      "Serie de ventas responde",
      salesSeries.status === 200 && Array.isArray(payload(salesSeries)),
    );
    const earningsSeries = await get(
      "admin.earningsByPeriod",
      { period: "day" },
      adminJar,
    );
    record(
      "Serie de ganancias responde",
      earningsSeries.status === 200 && Array.isArray(payload(earningsSeries)),
    );
    const growth = await get("admin.salesGrowth", { period: "day" }, adminJar);
    record(
      "Growth calcula ventana equivalente",
      growth.status === 200 &&
        typeof payload(growth)?.windowDays === "number" &&
        "growthPercent" in (payload(growth) || {}),
    );
    const topProducts = await get("admin.topProducts", { limit: 5 }, adminJar);
    record(
      "Top productos responde",
      topProducts.status === 200 && Array.isArray(payload(topProducts)),
    );

    // Restaurar settings y comisión
    if (originalSettings.delivery_fee !== undefined) {
      await post(
        "admin.updateSettingsBulk",
        {
          settings: [
            { key: "delivery_fee", value: originalSettings.delivery_fee || "2.50" },
            { key: "min_order_amount", value: originalSettings.min_order_amount || "5.00" },
          ],
        },
        adminJar,
      );
    }
  } finally {
    for (const orderId of createdOrders) {
      await pool.query("delete from driver_earnings where order_id = $1", [orderId]).catch(() => {});
      await pool.query("delete from orders where id = $1", [orderId]).catch(() => {});
    }
    if (originalCommerceRate) {
      await pool.query("update commerces set commission_rate = $1 where id = 1", [
        originalCommerceRate,
      ]).catch(() => {});
    }
    if (originalProductState) {
      await pool.query(
        "update products set is_available = $1, admin_paused = $2 where id = $3",
        [
          originalProductState.is_available,
          originalProductState.admin_paused,
          originalProductState.id,
        ],
      ).catch(() => {});
    }
    if (originalDriverStatus) {
      await pool.query("update drivers set status = $1 where id = 1", [
        originalDriverStatus,
      ]).catch(() => {});
    }
    for (const userId of createdMerchantIds) {
      await pool.query("delete from products where commerce_id in (select id from commerces where merchant_user_id = $1)", [userId]).catch(() => {});
      await pool.query("delete from commerces where merchant_user_id = $1", [userId]).catch(() => {});
      await pool.query("delete from users where id = $1", [userId]).catch(() => {});
    }
    await pool.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("ADMIN API SMOKE FAILED:", error);
  process.exitCode = 1;
});