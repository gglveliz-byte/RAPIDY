import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * E2E de producción — flujo Repartidor.
 *
 * Crea dos repartidores temporales y pedidos de laboratorio, recorre el flujo
 * completo por la API tRPC y limpia todo al terminar. No usa el navegador, no
 * reinicia el servidor y no aplica migraciones.
 *
 * Uso:
 *   node scripts/production-driver-smoke.mjs
 *
 * Variables opcionales:
 *   E2E_BASE_URL, E2E_DRIVER_PHONE, E2E_OTHER_DRIVER_PHONE,
 *   E2E_DRIVER_PASSWORD, DATABASE_URL
 */

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const RUN_TAG = String(Date.now()).slice(-7);
const DRIVER_PHONE = (process.env.E2E_DRIVER_PHONE || `099${RUN_TAG}`).replace(/\D/g, "");
const OTHER_DRIVER_PHONE = (
  process.env.E2E_OTHER_DRIVER_PHONE || `098${RUN_TAG}`
).replace(/\D/g, "");
const DRIVER_PASSWORD = process.env.E2E_DRIVER_PASSWORD || "rapidy-e2e-driver-17";
const DELIVERY_FEE = 2.5;
const DRIVER_COMMISSION = 75;
const ORDER_MARKER = `Notas E2E Repartidor ${RUN_TAG}`;

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

async function parseResponse(response, jar) {
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

async function post(path, input, jar) {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
    },
    body: JSON.stringify({ json: input ?? {} }),
  });
  return parseResponse(response, jar);
}

async function get(path, input, jar) {
  const response = await fetch(
    `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(
      JSON.stringify({ json: input ?? {} }),
    )}`,
    { headers: jar ? { cookie: cookieHeader(jar) } : {} },
  );
  return parseResponse(response, jar);
}

async function getRaw(path, cookie) {
  const response = await fetch(
    `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(
      JSON.stringify({ json: {} }),
    )}`,
    { headers: cookie ? { cookie } : {} },
  );
  return parseResponse(response);
}

const payload = (result) => result.data?.result?.data?.json;
const errorText = (result) =>
  result.data?.error?.json?.message ||
  result.data?.error?.message ||
  `HTTP ${result.status}`;

async function createDriver(pool, name, phone, passwordHash, status = "online") {
  const inserted = await pool.query(
    `insert into drivers
      (name, phone, password_hash, vehicle, license_plate, status, commission_rate)
     values ($1, $2, $3, 'Moto E2E', 'E2E-017', $4, $5)
     returning id`,
    [name, phone, passwordHash, status, DRIVER_COMMISSION.toFixed(2)],
  );
  return Number(inserted.rows[0].id);
}

async function createOrder(pool, input) {
  const {
    customerId,
    lines,
    status = "ready_for_pickup",
    driverId = null,
    commerceStatus = "ready_for_pickup",
  } = input;
  const subtotal = lines.reduce((sum, line) => sum + Number(line.price), 0);
  const commission = lines.reduce((sum, line) => sum + Number(line.price) * 0.1, 0);
  const total = subtotal + DELIVERY_FEE;

  const inserted = await pool.query(
    `insert into orders
      (customer_id, driver_id, driver_commission_rate, status, subtotal, delivery_fee,
       commission, total, payment_method, delivery_address, customer_phone, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'cash', $9, $10, $11)
     returning id`,
    [
      customerId,
      driverId,
      driverId ? DRIVER_COMMISSION.toFixed(2) : null,
      status,
      subtotal.toFixed(2),
      DELIVERY_FEE.toFixed(2),
      commission.toFixed(2),
      total.toFixed(2),
      "Dirección E2E Repartidor 17, Guayaquil",
      "0990000017",
      ORDER_MARKER,
    ],
  );
  const orderId = Number(inserted.rows[0].id);

  const commerceIds = [...new Set(lines.map((line) => line.commerceId))];
  for (const line of lines) {
    await pool.query(
      `insert into order_items
        (order_id, product_id, commerce_id, product_name, quantity, unit_price, total)
       values ($1, $2, $3, $4, '1', $5, $5)`,
      [orderId, line.productId, line.commerceId, line.name, Number(line.price).toFixed(2)],
    );
  }
  for (const commerceId of commerceIds) {
    const commerceTotal = lines
      .filter((line) => line.commerceId === commerceId)
      .reduce((sum, line) => sum + Number(line.price), 0);
    await pool.query(
      `insert into order_commerce_status
        (order_id, commerce_id, status, commission_amount)
       values ($1, $2, $3, $4)`,
      [orderId, commerceId, commerceStatus, (commerceTotal * 0.1).toFixed(2)],
    );
  }

  return { id: orderId, commerceIds };
}

async function orderRow(pool, orderId) {
  return (
    await pool.query(
      `select id, driver_id, status, delivered_at, picked_up_commerce_ids
       from orders where id = $1`,
      [orderId],
    )
  ).rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio para crear y limpiar los datos E2E.");
  }
  if (DRIVER_PHONE === OTHER_DRIVER_PHONE) {
    throw new Error("E2E_DRIVER_PHONE y E2E_OTHER_DRIVER_PHONE deben ser distintos.");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const cleanup = { driverIds: [], orderIds: [] };

  const passwordHash = await bcrypt.hash(DRIVER_PASSWORD, 10);

  try {
    const ping = await getRaw("login.checkAuth", "");
    if (ping.status !== 200) {
      throw new Error(`El servidor no responde en ${BASE_URL} (HTTP ${ping.status}).`);
    }

    const customer = (
      await pool.query(
        "select id from customers where deleted_at is null order by id limit 1",
      )
    ).rows[0];
    if (!customer) {
      throw new Error("No hay clientes en la base de datos para crear pedidos E2E.");
    }

    // Dos comercios distintos permiten validar el retiro parcial por comercio.
    const productRows = (
      await pool.query(
        `select p.id, p.name, p.price, p.commerce_id, c.name as commerce_name
         from products p
         join commerces c on c.id = p.commerce_id
         where c.status = 'active' and c.is_open = 'open'
           and p.is_available = 'yes' and p.admin_paused = false
         order by c.id, p.id`,
      )
    ).rows;
    const byCommerce = new Map();
    for (const row of productRows) {
      const commerceId = Number(row.commerce_id);
      if (!byCommerce.has(commerceId)) byCommerce.set(commerceId, []);
      byCommerce.get(commerceId).push({
        commerceId,
        productId: Number(row.id),
        name: row.name,
        price: row.price,
      });
    }
    const selectedCommerceIds = [...byCommerce.keys()].slice(0, 2);
    if (selectedCommerceIds.length === 0) {
      throw new Error("No hay productos disponibles para crear pedidos E2E.");
    }
    const mainLines = selectedCommerceIds.map((commerceId) => byCommerce.get(commerceId)[0]);
    const secondLines = [mainLines[0]];

    const driverId = await createDriver(
      pool,
      `Driver E2E Producción ${RUN_TAG}`,
      DRIVER_PHONE,
      passwordHash,
    );
    cleanup.driverIds.push(driverId);

    const otherDriverId = await createDriver(
      pool,
      `Driver E2E Ajeno ${RUN_TAG}`,
      OTHER_DRIVER_PHONE,
      passwordHash,
    );
    cleanup.driverIds.push(otherDriverId);

    const mainOrder = await createOrder(pool, {
      customerId: customer.id,
      lines: mainLines,
    });
    cleanup.orderIds.push(mainOrder.id);

    const secondOrder = await createOrder(pool, {
      customerId: customer.id,
      lines: secondLines,
    });
    cleanup.orderIds.push(secondOrder.id);

    const foreignOrder = await createOrder(pool, {
      customerId: customer.id,
      lines: secondLines,
      status: "driver_assigned",
      driverId: otherDriverId,
    });
    cleanup.orderIds.push(foreignOrder.id);

    console.log(
      `SETUP drivers=${driverId},${otherDriverId} orders=${mainOrder.id},${secondOrder.id},${foreignOrder.id} phone=${DRIVER_PHONE}`,
    );

    const jar = new Map();

    // ── Login ────────────────────────────────────────────────────────────────
    const login = await post(
      "login.login",
      { phone: DRIVER_PHONE, password: DRIVER_PASSWORD },
      jar,
    );
    const loginBody = payload(login);
    record(
      "Login por teléfono",
      login.status === 200 &&
        loginBody?.role === "driver" &&
        Number(loginBody?.user?.id) === driverId,
      loginBody?.role ?? errorText(login),
    );
    record(
      "Sesión driver con cookies HttpOnly",
      jar.has("quickgo_driver_token") && jar.has("quickgo_driver_refresh"),
    );

    const checkAuth = await get("login.checkAuth", undefined, jar);
    record(
      "checkAuth devuelve driver",
      checkAuth.status === 200 && payload(checkAuth)?.role === "driver",
      payload(checkAuth)?.role,
    );

    // ── Disponibles sin PII ─────────────────────────────────────────────────
    const available = await get("order.getAvailableForDriver", undefined, jar);
    const availableList = payload(available);
    record(
      "Disponibles responde",
      available.status === 200 && Array.isArray(availableList),
      errorText(available),
    );
    const mainAvailable = availableList?.find((order) => order.id === mainOrder.id);
    record(
      "Pedido E2E visible en disponibles",
      Boolean(mainAvailable),
      mainAvailable ? `#${mainAvailable.id}` : "no encontrado",
    );
    record(
      "Disponibles sin PII antes de aceptar",
      Array.isArray(availableList) &&
        availableList.every(
          (order) =>
            !("customerPhone" in order) &&
            !("deliveryAddress" in order) &&
            !("notes" in order) &&
            !("paymentReceipt" in order),
        ),
    );
    record(
      "Disponibles con comercio y ganancia estimada",
      Boolean(
        mainAvailable &&
          mainAvailable.commerceName &&
          mainAvailable.estimatedEarning ===
            (DELIVERY_FEE * (DRIVER_COMMISSION / 100)).toFixed(2),
      ),
      mainAvailable?.estimatedEarning,
    );

    const beforeAcceptDetail = await get(
      "order.getById",
      { id: mainOrder.id },
      jar,
    );
    record(
      "No puede ver detalle ajeno antes de aceptar",
      beforeAcceptDetail.status === 403,
      errorText(beforeAcceptDetail),
    );

    // ── Aceptar y bloqueo de doble pedido ───────────────────────────────────
    const accept = await post("driver.acceptOrder", { orderId: mainOrder.id }, jar);
    const acceptedRow = await orderRow(pool, mainOrder.id);
    record(
      "Aceptar deja driver_assigned",
      accept.status === 200 &&
        acceptedRow.status === "driver_assigned" &&
        Number(acceptedRow.driver_id) === driverId,
      `${accept.status} ${acceptedRow.status}`,
    );
    const busyDriver = (
      await pool.query("select status from drivers where id = $1", [driverId])
    ).rows[0];
    record("Aceptar marca al driver busy", busyDriver?.status === "busy", busyDriver?.status);

    const active = await get("driver.getActiveOrders", { id: driverId }, jar);
    record(
      "Pedido activo visible en el home",
      active.status === 200 &&
        payload(active)?.some((order) => order.id === mainOrder.id),
      errorText(active),
    );

    const postAcceptDetail = await get("order.getById", { id: mainOrder.id }, jar);
    const postAcceptBody = payload(postAcceptDetail);
    record(
      "Tras aceptar recibe dirección y teléfono",
      postAcceptDetail.status === 200 &&
        Boolean(postAcceptBody?.deliveryAddress) &&
        Boolean(postAcceptBody?.customerPhone),
    );
    record(
      "Detalle sin comprobante de pago",
      postAcceptDetail.status === 200 && !("paymentReceipt" in (postAcceptBody || {})),
    );

    const secondAccept = await post(
      "driver.acceptOrder",
      { orderId: secondOrder.id },
      jar,
    );
    const secondRow = await orderRow(pool, secondOrder.id);
    record(
      "No puede aceptar dos pedidos",
      secondAccept.status >= 400 && secondRow.driver_id === null,
      errorText(secondAccept),
    );

    const logoutWithActive = await post("driver.logoutSession", {}, jar);
    const stillAuthenticated = await get("login.checkAuth", undefined, jar);
    record(
      "Logout bloqueado con pedido activo",
      logoutWithActive.status >= 400 &&
        payload(stillAuthenticated)?.authenticated === true,
      errorText(logoutWithActive),
    );

    // ── No entregar sin retirar ─────────────────────────────────────────────
    const earlyDeliver = await post(
      "order.updateStatus",
      { id: mainOrder.id, status: "delivered" },
      jar,
    );
    const afterEarlyDeliver = await orderRow(pool, mainOrder.id);
    record(
      "No puede entregar sin retirar",
      earlyDeliver.status >= 400 && afterEarlyDeliver.status === "driver_assigned",
      `${errorText(earlyDeliver)} / ${afterEarlyDeliver.status}`,
    );

    const earlyOnTheWay = await post(
      "order.updateStatus",
      { id: mainOrder.id, status: "on_the_way" },
      jar,
    );
    record(
      "No puede salir en camino sin retirar",
      earlyOnTheWay.status >= 400,
      errorText(earlyOnTheWay),
    );

    // ── Retiro por comercio ─────────────────────────────────────────────────
    const firstCommerceId = mainOrder.commerceIds[0];
    const firstPickup = await post(
      "driver.markCommercePickup",
      { orderId: mainOrder.id, commerceId: firstCommerceId },
      jar,
    );
    const afterFirstPickup = await orderRow(pool, mainOrder.id);
    const expectPartial = mainOrder.commerceIds.length > 1;
    record(
      expectPartial
        ? "Retiro parcial mantiene el pedido asignado"
        : "Retiro por comercio pasa a picked_up",
      firstPickup.status === 200 &&
        (expectPartial
          ? afterFirstPickup.status === "driver_assigned"
          : afterFirstPickup.status === "picked_up"),
      `${firstPickup.status} ${afterFirstPickup.status}`,
    );
    record(
      "Retiro registra el comercio",
      (afterFirstPickup.picked_up_commerce_ids ?? []).includes(firstCommerceId),
    );

    const duplicatePickup = await post(
      "driver.markCommercePickup",
      { orderId: mainOrder.id, commerceId: firstCommerceId },
      jar,
    );
    record(
      "No puede retirar dos veces el mismo comercio",
      duplicatePickup.status >= 400,
      errorText(duplicatePickup),
    );

    for (const commerceId of mainOrder.commerceIds.slice(1)) {
      const pickup = await post(
        "driver.markCommercePickup",
        { orderId: mainOrder.id, commerceId },
        jar,
      );
      if (pickup.status !== 200) {
        record(
          `Retiro del comercio ${commerceId}`,
          false,
          errorText(pickup),
        );
      }
    }
    const afterAllPickups = await orderRow(pool, mainOrder.id);
    record(
      "Todos los comercios retirados dejan picked_up",
      afterAllPickups.status === "picked_up" &&
        mainOrder.commerceIds.every((commerceId) =>
          (afterAllPickups.picked_up_commerce_ids ?? []).includes(commerceId),
        ),
      afterAllPickups.status,
    );

    const deliverBeforeOnTheWay = await post(
      "order.updateStatus",
      { id: mainOrder.id, status: "delivered" },
      jar,
    );
    const afterDeliverBeforeOnTheWay = await orderRow(pool, mainOrder.id);
    record(
      "No puede entregar antes de on_the_way",
      deliverBeforeOnTheWay.status >= 400 &&
        afterDeliverBeforeOnTheWay.status === "picked_up",
      errorText(deliverBeforeOnTheWay),
    );

    // ── On the way y entrega ────────────────────────────────────────────────
    const onTheWay = await post(
      "order.updateStatus",
      { id: mainOrder.id, status: "on_the_way" },
      jar,
    );
    const onTheWayRow = await orderRow(pool, mainOrder.id);
    record(
      "Pasa a on_the_way",
      onTheWay.status === 200 && onTheWayRow.status === "on_the_way",
      `${onTheWay.status} ${onTheWayRow.status}`,
    );

    const pickupAfterOnTheWay = await post(
      "driver.markCommercePickup",
      { orderId: mainOrder.id, commerceId: firstCommerceId },
      jar,
    );
    record(
      "No puede retirar después de on_the_way",
      pickupAfterOnTheWay.status >= 400,
      errorText(pickupAfterOnTheWay),
    );

    const delivered = await post(
      "order.updateStatus",
      { id: mainOrder.id, status: "delivered" },
      jar,
    );
    const deliveredRow = await orderRow(pool, mainOrder.id);
    record(
      "Entrega deja delivered y delivered_at",
      delivered.status === 200 &&
        deliveredRow.status === "delivered" &&
        Boolean(deliveredRow.delivered_at),
      `${delivered.status} ${deliveredRow.status}`,
    );

    const driverAfterDelivery = (
      await pool.query("select status from drivers where id = $1", [driverId])
    ).rows[0];
    record(
      "Entrega devuelve al driver a online",
      driverAfterDelivery?.status === "online",
      driverAfterDelivery?.status,
    );

    // ── Ganancia, perfil e historial ────────────────────────────────────────
    const expectedEarning = (DELIVERY_FEE * (DRIVER_COMMISSION / 100)).toFixed(2);
    const earning = (
      await pool.query(
        `select amount, type, date from driver_earnings
         where order_id = $1 and driver_id = $2`,
        [mainOrder.id, driverId],
      )
    ).rows[0];
    record(
      "Ganancia neta con la comisión del driver",
      Boolean(earning) &&
        Number(earning.amount) === Number(expectedEarning) &&
        earning.type === "delivery_fee",
      earning?.amount,
    );

    const earnings = await get("driver.getEarnings", { id: driverId }, jar);
    record(
      "getEarnings incluye la entrega",
      earnings.status === 200 &&
        payload(earnings)?.some(
          (row) =>
            Number(row.orderId) === mainOrder.id &&
            Number(row.amount) === Number(expectedEarning),
        ),
      errorText(earnings),
    );

    const profile = await get("driver.getProfile", undefined, jar);
    const profileBody = payload(profile);
    record(
      "Perfil del driver",
      profile.status === 200 &&
        Number(profileBody?.id) === driverId &&
        profileBody?.phone === DRIVER_PHONE &&
        profileBody?.commissionRate === DRIVER_COMMISSION.toFixed(2),
      profileBody?.phone ?? errorText(profile),
    );
    record(
      "Perfil suma ganancias",
      profileBody?.totalEarnings === expectedEarning,
      profileBody?.totalEarnings,
    );

    const otherProfile = await get("driver.getProfile", { id: otherDriverId }, jar);
    record(
      "No puede ver el perfil de otro driver",
      otherProfile.status === 403,
      errorText(otherProfile),
    );

    const updatedProfile = await post(
      "driver.updateProfile",
      { id: driverId, vehicle: "Moto E2E 17", licensePlate: "E2E-017" },
      jar,
    );
    record(
      "Actualiza su propio perfil",
      updatedProfile.status === 200 &&
        payload(updatedProfile)?.vehicle === "Moto E2E 17" &&
        payload(updatedProfile)?.licensePlate === "E2E-017",
      errorText(updatedProfile),
    );

    const history = await get("driver.getOrderHistory", { limit: 50 }, jar);
    const historyOrder = payload(history)?.find((order) => order.id === mainOrder.id);
    record(
      "Historial con earningAmount",
      history.status === 200 && historyOrder?.earningAmount === expectedEarning,
      historyOrder?.earningAmount,
    );
    record(
      "Historial sin teléfono ni comprobante",
      history.status === 200 &&
        !("customerPhone" in (historyOrder || {})) &&
        !("paymentReceipt" in (historyOrder || {})),
    );
    record(
      "Historial usa deliveredAt",
      Boolean(historyOrder?.deliveredAt),
    );

    // ── Chat ────────────────────────────────────────────────────────────────
    const customerMessage = await pool.query(
      `insert into chat_messages
        (order_id, sender_type, sender_id, sender_name, message)
       values ($1, 'customer', $2, 'Cliente E2E', 'Mensaje E2E al repartidor')
       returning id`,
      [mainOrder.id, customer.id],
    );
    const customerMessageId = Number(customerMessage.rows[0].id);

    const chatList = await get("chat.getByOrder", { orderId: mainOrder.id }, jar);
    record(
      "Chat del pedido visible para el driver",
      chatList.status === 200 &&
        payload(chatList)?.some((message) => message.id === customerMessageId),
      errorText(chatList),
    );

    const markRead = await post("chat.markAsRead", { orderId: mainOrder.id }, jar);
    const readFlags = (
      await pool.query(
        `select read_by_driver, is_read from chat_messages where id = $1`,
        [customerMessageId],
      )
    ).rows[0];
    record(
      "Chat marca lectura solo del rol driver",
      markRead.status === 200 &&
        readFlags?.read_by_driver === "yes" &&
        readFlags?.is_read === "no",
      `${readFlags?.read_by_driver}/${readFlags?.is_read}`,
    );

    const sentMessage = await post(
      "chat.send",
      { orderId: mainOrder.id, message: "Confirmo la entrega E2E." },
      jar,
    );
    const sentBody = payload(sentMessage);
    record(
      "Driver envía mensaje con su identidad",
      sentMessage.status === 200 &&
        sentBody?.senderType === "driver" &&
        Number(sentBody?.senderId) === driverId,
      errorText(sentMessage),
    );

    const impersonation = await post(
      "chat.send",
      { orderId: mainOrder.id, message: "Intento de suplantación", as: "customer" },
      jar,
    );
    record(
      "No puede enviar chat como cliente",
      impersonation.status === 403,
      errorText(impersonation),
    );

    // ── Pedidos ajenos ──────────────────────────────────────────────────────
    const foreignDetail = await get(
      "order.getById",
      { id: foreignOrder.id },
      jar,
    );
    record(
      "No puede ver un pedido de otro driver",
      foreignDetail.status === 403,
      errorText(foreignDetail),
    );

    const foreignStatus = await post(
      "order.updateStatus",
      { id: foreignOrder.id, status: "on_the_way" },
      jar,
    );
    record(
      "No puede cambiar el estado de un pedido ajeno",
      foreignStatus.status === 403,
      errorText(foreignStatus),
    );

    const foreignPickup = await post(
      "driver.markCommercePickup",
      { orderId: foreignOrder.id, commerceId: foreignOrder.commerceIds[0] },
      jar,
    );
    record(
      "No puede retirar un pedido ajeno",
      foreignPickup.status === 403,
      errorText(foreignPickup),
    );

    const foreignChat = await get(
      "chat.getByOrder",
      { orderId: foreignOrder.id },
      jar,
    );
    record(
      "No puede leer el chat de un pedido ajeno",
      foreignChat.status === 403,
      errorText(foreignChat),
    );

    const foreignActive = await get(
      "driver.getActiveOrders",
      { id: otherDriverId },
      jar,
    );
    record(
      "No puede consultar pedidos activos ajenos",
      foreignActive.status >= 400,
      errorText(foreignActive),
    );

    const foreignEarnings = await get(
      "driver.getEarnings",
      { id: otherDriverId },
      jar,
    );
    record(
      "No puede consultar ganancias ajenas",
      foreignEarnings.status === 403,
      errorText(foreignEarnings),
    );

    // ── Logout y revocación ─────────────────────────────────────────────────
    const sessionBefore = (
      await pool.query("select session_version from drivers where id = $1", [driverId])
    ).rows[0];
    const oldJar = new Map(jar);
    const oldCookie = cookieHeader(jar);

    const logout = await post("driver.logoutSession", {}, jar);
    const sessionAfter = (
      await pool.query(
        "select status, session_version from drivers where id = $1",
        [driverId],
      )
    ).rows[0];
    record(
      "Logout driver marca offline y sube sessionVersion",
      logout.status === 200 &&
        sessionAfter.status === "offline" &&
        Number(sessionAfter.session_version) === Number(sessionBefore.session_version) + 1,
      `${logout.status} ${sessionAfter.status} v${sessionAfter.session_version}`,
    );

    const oldAccess = await getRaw("login.checkAuth", oldCookie);
    record(
      "Logout revoca el access token anterior",
      oldAccess.status === 200 &&
        payload(oldAccess)?.authenticated === false,
      payload(oldAccess)?.role,
    );

    const oldProfile = await get("driver.getProfile", undefined, oldJar);
    record(
      "La cookie anterior ya no puede consultar el perfil",
      oldProfile.status === 401,
      errorText(oldProfile),
    );

    const oldRefresh = await post("login.refresh", {}, oldJar);
    record(
      "Logout revoca el refresh token anterior",
      oldRefresh.status === 200 && payload(oldRefresh)?.success === false,
      payload(oldRefresh)?.success,
    );

    const cleared = (
      await pool.query(
        "select status, fcm_token from drivers where id = $1",
        [driverId],
      )
    ).rows[0];
    record(
      "Logout deja al driver offline y sin FCM",
      cleared?.status === "offline" && cleared?.fcm_token === null,
      cleared?.status,
    );
  } finally {
    const { driverIds, orderIds } = cleanup;
    try {
      // Recupera pedidos huérfanos si una inserción falló a mitad de camino.
      const markerOrders = (
        await pool.query("select id from orders where notes = $1", [ORDER_MARKER])
      ).rows.map((row) => Number(row.id));
      const allOrderIds = [...new Set([...orderIds, ...markerOrders])];

      if (allOrderIds.length > 0) {
        await pool.query(
          "delete from driver_earnings where order_id = any($1::bigint[])",
          [allOrderIds],
        );
      }
      if (driverIds.length > 0) {
        await pool.query(
          "delete from driver_earnings where driver_id = any($1::bigint[])",
          [driverIds],
        );
      }
      if (allOrderIds.length > 0) {
        await pool.query("delete from orders where id = any($1::int[])", [allOrderIds]);
      }
      if (driverIds.length > 0) {
        await pool.query("delete from drivers where id = any($1::int[])", [driverIds]);
      }
      const [leftOrders, leftDrivers, leftEarnings] = await Promise.all([
        pool.query(
          "select count(*) from orders where id = any($1::int[]) or notes = $2",
          [allOrderIds, ORDER_MARKER],
        ),
        pool.query(
          "select count(*) from drivers where id = any($1::int[])",
          [driverIds],
        ),
        pool.query(
          "select count(*) from driver_earnings where driver_id = any($1::bigint[])",
          [driverIds],
        ),
      ]);
      console.log(
        `\nLIMPIEZA orders=${leftOrders.rows[0].count} drivers=${leftDrivers.rows[0].count} earnings=${leftEarnings.rows[0].count}`,
      );
    } catch (error) {
      console.error("LIMPIEZA E2E FALLÓ:", error);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("E2E DRIVER PRODUCCIÓN FALLÓ:", error);
  process.exitCode = 1;
});