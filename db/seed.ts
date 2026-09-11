import "dotenv/config";
import { getDb } from "../server/queries/connection";
import { categories, commerces, products, appSettings, users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  const db = getDb();

  // Clear all tables
  await db.execute(sql`DELETE FROM order_status_history`);
  await db.execute(sql`DELETE FROM chat_messages`);
  await db.execute(sql`DELETE FROM driver_earnings`);
  await db.execute(sql`DELETE FROM order_items`);
  await db.execute(sql`DELETE FROM orders`);
  await db.execute(sql`DELETE FROM products`);
  await db.execute(sql`DELETE FROM commerces`);
  await db.execute(sql`DELETE FROM categories`);
  await db.execute(sql`DELETE FROM customers`);
  await db.execute(sql`DELETE FROM drivers`);
  await db.execute(sql`DELETE FROM users`);
  await db.execute(sql`DELETE FROM app_settings`);

  // Reset auto-increment sequences
  await db.execute(sql`SELECT setval('categories_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('commerces_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('products_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('drivers_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('customers_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('orders_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('order_items_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('driver_earnings_id_seq', 1, false)`);
  await db.execute(sql`SELECT setval('app_settings_id_seq', 1, false)`);

  console.log("Seeding categories...");
  await db.insert(categories).values([
    { name: "Comidas", icon: "UtensilsCrossed", color: "#E65100", sortOrder: 1 },
    { name: "Panaderías", icon: "Croissant", color: "#F9A825", sortOrder: 2 },
    { name: "Supermercados", icon: "ShoppingCart", color: "#2E7D32", sortOrder: 3 },
    { name: "Farmacias", icon: "Pill", color: "#1565C0", sortOrder: 4 },
    { name: "Heladerías", icon: "IceCreamCone", color: "#AD1457", sortOrder: 5 },
    { name: "Bebidas", icon: "Coffee", color: "#6A1B9A", sortOrder: 6 },
    { name: "Mascotas", icon: "Dog", color: "#5D4037", sortOrder: 7 },
    { name: "Otros", icon: "MoreHorizontal", color: "#757575", sortOrder: 8 },
  ]);

  console.log("Seeding commerces...");
  const commercesData = await db.insert(commerces).values([
    {
      name: "La Esquina del Sabor",
      description: "Comida casera y abundante",
      logo: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=200&fit=crop&auto=format",
      coverImage: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&h=400&fit=crop&auto=format",
      categoryId: 1,
      address: "Av. Corrientes 1234, CABA",
      phone: "+54 9 11 4567-8901",
      email: "laesquina@email.com",
      minOrder: "3000.00",
      deliveryTime: "35-45 min",
      rating: "4.5",
      status: "active",
      isOpen: "open",
      openHours: '{"mon-fri": "11:00-23:00", "sat-sun": "12:00-23:30"}',
      commissionRate: "12.00",
      lat: -34.6037,
      lng: -58.3816,
    },
    {
      name: "Panadería El Horno",
      description: "Pan fresco y facturas artesanales",
      logo: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=200&fit=crop&auto=format",
      coverImage: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&h=400&fit=crop&auto=format",
      categoryId: 2,
      address: "Av. Santa Fe 567, Palermo",
      phone: "+54 9 11 2345-6789",
      email: "elhornopan@email.com",
      minOrder: "1500.00",
      deliveryTime: "20-30 min",
      rating: "4.8",
      status: "active",
      isOpen: "open",
      openHours: '{"mon-sat": "07:00-20:00", "sun": "08:00-13:00"}',
      commissionRate: "10.00",
      lat: -34.5882,
      lng: -58.3926,
    },
    {
      name: "Supermercado Día a Día",
      description: "Todo lo que necesitas a un click",
      logo: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&h=200&fit=crop&auto=format",
      coverImage: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=400&fit=crop&auto=format",
      categoryId: 3,
      address: "Av. Cabildo 2100, Belgrano",
      phone: "+54 9 11 3456-7890",
      email: "diadia@super.com",
      minOrder: "5000.00",
      deliveryTime: "40-50 min",
      rating: "4.2",
      status: "active",
      isOpen: "open",
      openHours: '{"mon-sun": "08:00-22:00"}',
      commissionRate: "8.00",
      lat: -34.5598,
      lng: -58.4456,
    },
    {
      name: "Farmacia Central",
      description: "Medicamentos y perfumería 24hs",
      logo: "https://images.unsplash.com/photo-1587395878062-8e3e5f8b8f4d?w=200&h=200&fit=crop&auto=format",
      coverImage: "https://images.unsplash.com/photo-1587395878062-8e3e5f8b8f4d?w=800&h=400&fit=crop&auto=format",
      categoryId: 4,
      address: "Av. Rivadavia 3456, Almagro",
      phone: "+54 9 11 4567-1234",
      email: "central@farmacia.com",
      minOrder: "1000.00",
      deliveryTime: "15-25 min",
      rating: "4.6",
      status: "active",
      isOpen: "open",
      openHours: '{"mon-sun": "00:00-23:59"}',
      commissionRate: "15.00",
      lat: -34.6132,
      lng: -58.4211,
    },
    {
      name: "Heladería Dulce Frío",
      description: "Helados artesanales y postres",
      logo: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&h=200&fit=crop&auto=format",
      coverImage: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&h=400&fit=crop&auto=format",
      categoryId: 5,
      address: "Av. Scalabrini Ortiz 1890, Villa Crespo",
      phone: "+54 9 11 5678-9012",
      email: "dulcefrio@helados.com",
      minOrder: "2000.00",
      deliveryTime: "25-35 min",
      rating: "4.9",
      status: "active",
      isOpen: "open",
      openHours: '{"mon-thu": "12:00-00:00", "fri-sat": "12:00-01:00", "sun": "14:00-23:00"}',
      commissionRate: "12.00",
      lat: -34.5978,
      lng: -58.4273,
    },
  ]).returning({ id: commerces.id });

  const commerceIds = commercesData.map(c => c.id);

  console.log("Seeding products...");
  const productsData = [
    // La Esquina del Sabor (Comidas)
    { commerceId: commerceIds[0], name: "Milanesa con papas fritas", description: "Milanesa de carne o pollo con papas fritas caseras", price: "8500.00", image: "https://upload.wikimedia.org/wikipedia/commons/9/96/Milanesa_napolitana_con_papas_fritas_rodajas_de_tomate_y_or%C3%A9gano.jpg", category: "Principales", unitType: "unit", isFeatured: "yes", isAvailable: "yes", preparationTime: 25 },
    { commerceId: commerceIds[0], name: "Hamburguesa completa", description: "Hamburguesa con lechuga, tomate, queso, huevo y papas", price: "7200.00", image: "https://images.unsplash.com/photo-1666304927476-065fd6a18b21?w=600&h=400&fit=crop&auto=format", category: "Principales", unitType: "unit", isFeatured: "yes", isAvailable: "yes", preparationTime: 20 },
    { commerceId: commerceIds[0], name: "Papas fritas grandes", description: "Porción grande de papas fritas caseras", price: "3500.00", image: "https://images.unsplash.com/photo-1685712612098-f1461c9d2d85?w=600&h=400&fit=crop&auto=format", category: "Guarniciones", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 15 },
    { commerceId: commerceIds[0], name: "Ensalada mixta", description: "Lechuga, tomate, cebolla, zanahoria y huevo", price: "4200.00", image: "https://images.unsplash.com/photo-1569246294372-ed319c674f14?w=600&h=400&fit=crop&auto=format", category: "Entradas", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 10 },

    // Panadería El Horno
    { commerceId: commerceIds[1], name: "Docena de facturas surtidas", description: "Facturas de manteca, grasa, crema y dulce de leche", price: "4800.00", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=400&fit=crop&auto=format", category: "Facturas", unitType: "docena", isFeatured: "yes", isAvailable: "yes", preparationTime: 5 },
    { commerceId: commerceIds[1], name: "Pan flauta x2", description: "Dos panes flauta recién horneados", price: "1200.00", image: "https://images.unsplash.com/photo-1586511926871-deb1aca37f38?w=600&h=400&fit=crop&auto=format", category: "Pan", unitType: "pack", isFeatured: "no", isAvailable: "yes", preparationTime: 5 },
    { commerceId: commerceIds[1], name: "Medialunas de manteca x6", description: "Media docena de medialunas de manteca", price: "2800.00", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=400&fit=crop&auto=format", category: "Facturas", unitType: "pack", isFeatured: "yes", isAvailable: "yes", preparationTime: 5 },
    { commerceId: commerceIds[1], name: "Torta de cumpleaños (1kg)", description: "Torta de chocolate o vainilla con crema y dulce de leche", price: "12000.00", image: "https://images.unsplash.com/photo-1763634708683-b9c5307dcaa0?w=600&h=400&fit=crop&auto=format", category: "Tortas", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 120 },

    // Supermercado Día a Día
    { commerceId: commerceIds[2], name: "Leche entera 1L", description: "Leche entera larga vida 1 litro", price: "1200.00", image: "https://images.unsplash.com/photo-1553301803-768cd4a59b9c?w=600&h=400&fit=crop&auto=format", category: "Lácteos", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 2 },
    { commerceId: commerceIds[2], name: "Pan lactal blanco", description: "Pan de molde blanco 500g", price: "950.00", image: "https://images.unsplash.com/photo-1586511926871-deb1aca37f38?w=600&h=400&fit=crop&auto=format", category: "Panadería", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 2 },
    { commerceId: commerceIds[2], name: "Arroz 1kg", description: "Arroz blanco largo fino 1kg", price: "1100.00", image: "https://images.unsplash.com/photo-1641568159866-2321c4a8fe59?w=600&h=400&fit=crop&auto=format", category: "Despensa", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 2 },
    { commerceId: commerceIds[2], name: "Fideos tirabuzón 500g", description: "Fideos tirabuzón marca favorita 500g", price: "850.00", image: "https://images.unsplash.com/photo-1633614201174-a5172e93c21e?w=600&h=400&fit=crop&auto=format", category: "Despensa", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 2 },

    // Farmacia Central
    { commerceId: commerceIds[3], name: "Ibuprofeno 400mg x20", description: "Anti-inflamatorio 20 comprimidos", price: "2800.00", image: "https://images.unsplash.com/photo-1550572017-4fcdbb59cc32?w=600&h=400&fit=crop&auto=format", category: "Medicamentos", unitType: "caja", isFeatured: "yes", isAvailable: "yes", preparationTime: 3 },
    { commerceId: commerceIds[3], name: "Paracetamol 500mg x20", description: "Analgésico/antipirético 20 comprimidos", price: "2200.00", image: "https://images.unsplash.com/photo-1588718889344-f7bd7a565d20?w=600&h=400&fit=crop&auto=format", category: "Medicamentos", unitType: "caja", isFeatured: "yes", isAvailable: "yes", preparationTime: 3 },
    { commerceId: commerceIds[3], name: "Alcohol en gel 500ml", description: "Alcohol en gel antibacterial 70%", price: "1800.00", image: "https://images.unsplash.com/photo-1581579897037-92e05ce7d4b5?w=600&h=400&fit=crop&auto=format", category: "Primeros auxilios", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 2 },
    { commerceId: commerceIds[3], name: "Vitamina C 1g x30", description: "Vitamina C efervescente 30 comprimidos", price: "4500.00", image: "https://plus.unsplash.com/premium_photo-1732104312846-d4feffdc5ba2?w=600&h=400&fit=crop&auto=format", category: "Suplementos", unitType: "caja", isFeatured: "no", isAvailable: "yes", preparationTime: 3 },

    // Heladería Dulce Frío
    { commerceId: commerceIds[4], name: "Helado 1kg (2 sabores)", description: "Helado artesanal 1 kilo - 2 sabores a elección", price: "8500.00", image: "https://images.unsplash.com/photo-1629385701021-fcd568a743e8?w=600&h=400&fit=crop&auto=format", category: "Helados", unitType: "unit", isFeatured: "yes", isAvailable: "yes", preparationTime: 10 },
    { commerceId: commerceIds[4], name: "Helado 1/4kg (1 sabor)", description: "Helado artesanal 250g - 1 sabor a elección", price: "2800.00", image: "https://images.unsplash.com/photo-1629385701021-fcd568a743e8?w=600&h=400&fit=crop&auto=format", category: "Helados", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 5 },
    { commerceId: commerceIds[4], name: "Banana split", description: "Banana con 3 bolas de helado, crema, chocolate y nueces", price: "4200.00", image: "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=600&h=400&fit=crop&auto=format", category: "Postres", unitType: "unit", isFeatured: "yes", isAvailable: "yes", preparationTime: 8 },
    { commerceId: commerceIds[4], name: "Vaso de helado 2 bolas", description: "Vaso con 2 bolas de helado a elección", price: "3200.00", image: "https://images.unsplash.com/photo-1559703248-dcaaec9fab78?w=600&h=400&fit=crop&auto=format", category: "Helados", unitType: "unit", isFeatured: "no", isAvailable: "yes", preparationTime: 5 },
  ];

  await db.insert(products).values(productsData);

  // Seed app settings
  console.log("Seeding app settings...");
  await db.insert(appSettings).values([
    { key: "app_name", value: "YA LLEGA" },
    { key: "support_phone", value: "+54 9 11 1234-5678" },
    { key: "delivery_fee", value: "500" },
    { key: "commission_rate", value: "15" },
    { key: "min_order_amount", value: "2000" },
  ]);

  // Seed admin user
  console.log("Seeding admin user...");
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminHash = await bcrypt.hash(adminPassword, 10);
  await db.insert(users).values([
    {
      unionId: "admin-local",
      email: "admin@admin.com",
      name: "Administrador",
      passwordHash: adminHash,
      role: "admin",
    },
  ]);

  console.log("Skipping merchant users seeding for test bot...");

  console.log("Seed completed!");
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
