import "dotenv/config";
import { getDb } from "../server/queries/connection";
import { users, commerces, drivers } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  const db = getDb();

  console.log("═════════════════════════════════════════════════");
  console.log("  CREANDO CREDENCIALES DE PRUEBA EN LA BD");
  console.log("═════════════════════════════════════════════════\n");

  // 1. ADMIN
  const adminEmail = process.env.ADMIN_EMAIL || "admin@admin.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail));
  if (existingAdmin.length === 0) {
    await db.insert(users).values({
      unionId: "admin-local",
      name: "Administrador",
      email: adminEmail,
      passwordHash: adminHash,
      role: "admin",
    });
    console.log(`✅ Admin creado: ${adminEmail} / ${adminPassword}`);
  } else {
    await db.update(users).set({ passwordHash: adminHash, role: "admin" }).where(eq(users.id, existingAdmin[0].id));
    console.log(`✅ Admin actualizado: ${adminEmail} / ${adminPassword}`);
  }

  // 2. NEGOCIO / COMERCIO (Merchant)
  const merchantEmail = "comercio@test.com";
  const merchantPassword = "comercio123";
  const merchantHash = await bcrypt.hash(merchantPassword, 10);

  let merchantUserId: number;
  const existingMerchant = await db.select().from(users).where(eq(users.email, merchantEmail));
  if (existingMerchant.length === 0) {
    const [newMerchant] = await db.insert(users).values({
      unionId: "merchant-test-1",
      name: "Encargado La Esquina",
      email: merchantEmail,
      passwordHash: merchantHash,
      role: "merchant",
    }).returning({ id: users.id });
    merchantUserId = newMerchant.id;
    console.log(`✅ Usuario Comercio creado: ${merchantEmail} / ${merchantPassword}`);
  } else {
    merchantUserId = existingMerchant[0].id;
    await db.update(users).set({ passwordHash: merchantHash, role: "merchant" }).where(eq(users.id, merchantUserId));
    console.log(`✅ Usuario Comercio actualizado: ${merchantEmail} / ${merchantPassword}`);
  }

  // Vincular este usuario al primer comercio ("La Esquina del Sabor")
  const comms = await db.select().from(commerces).limit(1);
  if (comms.length > 0) {
    await db.update(commerces).set({ merchantUserId }).where(eq(commerces.id, comms[0].id));
    console.log(`✅ Comercio #${comms[0].id} ("${comms[0].name}") vinculado a ${merchantEmail}`);
  }

  // 3. REPARTIDOR / MOTOCICLETA (Driver)
  const driverPhone = "1122334455";
  const driverPassword = "moto123";
  const driverHash = await bcrypt.hash(driverPassword, 10);

  const existingDriver = await db.select().from(drivers).where(eq(drivers.phone, driverPhone));
  if (existingDriver.length === 0) {
    await db.insert(drivers).values({
      name: "Juan Motociclista",
      phone: driverPhone,
      passwordHash: driverHash,
      vehicle: "Motocicleta Honda GLH 150",
      licensePlate: "A123BCD",
      status: "online",
      currentLat: "-34.6037",
      currentLng: "-58.3816",
      rating: "4.9",
      commissionRate: "75.00",
    });
    console.log(`✅ Repartidor Moto creado: Teléfono: ${driverPhone} / Clave: ${driverPassword}`);
  } else {
    await db.update(drivers).set({
      passwordHash: driverHash,
      status: "online",
      vehicle: "Motocicleta Honda GLH 150",
    }).where(eq(drivers.id, existingDriver[0].id));
    console.log(`✅ Repartidor Moto actualizado: Teléfono: ${driverPhone} / Clave: ${driverPassword}`);
  }

  console.log("\n═════════════════════════════════════════════════");
  console.log("  CREDENCIALES LISTAS PARA PROBAR");
  console.log("═════════════════════════════════════════════════");

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
