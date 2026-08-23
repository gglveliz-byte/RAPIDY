import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  bigint,
  boolean,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin", "merchant"]);
export const driverStatusEnum = pgEnum("driver_status", ["online", "busy", "offline"]);
export const commerceStatusEnum = pgEnum("commerce_status", ["active", "inactive", "suspended", "pending"]);
export const openEnum = pgEnum("open_status", ["open", "closed"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "payment_rejected",
  "received",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "driver_assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
]);

export const orderCommerceStatusEnum = pgEnum("order_commerce_status_enum", [
  "preparing",
  "ready_for_pickup",
  "picked_up",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "transfer"]);
export const senderTypeEnum = pgEnum("sender_type", ["customer", "commerce", "driver"]);
export const featuredEnum = pgEnum("featured_status", ["yes", "no"]);
export const availableEnum = pgEnum("available_status", ["yes", "no"]);
export const readEnum = pgEnum("read_status", ["yes", "no"]);
export const earningsTypeEnum = pgEnum("earnings_type", ["delivery_fee", "tip", "bonus"]);

// ============= USERS (OAuth admin/managers) =============
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatar: text("avatar"),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
  fcmToken: text("fcm_token"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============= CUSTOMERS (Phone-based auth) =============
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fcmToken: text("fcm_token"),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ============= DRIVERS =============
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  vehicle: varchar("vehicle", { length: 100 }),
  licensePlate: varchar("license_plate", { length: 20 }),
  status: driverStatusEnum("status").default("offline").notNull(),
  currentLat: numeric("current_lat", { precision: 10, scale: 8 }),
  currentLng: numeric("current_lng", { precision: 11, scale: 8 }),
  rating: numeric("rating", { precision: 2, scale: 1 }).default("4.5"),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).default("0.00"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("75.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fcmToken: text("fcm_token"),
});

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;

// ============= CATEGORIES =============
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 100 }),
  color: varchar("color", { length: 7 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;

// ============= COMMERCES =============
export const commerces = pgTable("commerces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  logo: text("logo"),
  coverImage: text("cover_image"),
  categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => categories.id),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 200 }),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }).default("0.00"),
  deliveryTime: varchar("delivery_time", { length: 50 }),
  rating: numeric("rating", { precision: 2, scale: 1 }).default("4.0"),
  status: commerceStatusEnum("status").default("pending").notNull(),
  isOpen: openEnum("is_open").default("open").notNull(),
  openHours: text("open_hours"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("10.00"),
  lat: numeric("lat", { precision: 10, scale: 8 }),
  lng: numeric("lng", { precision: 11, scale: 8 }),
  merchantUserId: integer("merchant_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Commerce = typeof commerces.$inferSelect;
export type InsertCommerce = typeof commerces.$inferInsert;

// ============= PRODUCTS =============
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  commerceId: bigint("commerce_id", { mode: "number" }).notNull().references(() => commerces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  image: text("image"),
  category: varchar("category", { length: 100 }),
  unitType: varchar("unit_type", { length: 20 }).default("unit").notNull(),
  isFeatured: featuredEnum("is_featured").default("no").notNull(),
  isAvailable: availableEnum("is_available").default("yes").notNull(),
  preparationTime: integer("preparation_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ============= ORDERS =============
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id),
  driverId: bigint("driver_id", { mode: "number" }).references(() => drivers.id, { onDelete: "set null" }),
  pickedUpCommerceIds: integer("picked_up_commerce_ids").array().default([]).notNull(),
  status: orderStatusEnum("status").default("received").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("2.50"),
  commission: numeric("commission", { precision: 10, scale: 2 }).default("0.00"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").default("cash").notNull(),
  paymentReceipt: text("payment_receipt"),
  deliveryAddress: text("delivery_address").notNull(),
  customerPhone: varchar("customer_phone", { length: 20 }),
  notes: text("notes"),
  commerceSettled: boolean("commerce_settled").default(false).notNull(),
  driverSettled: boolean("driver_settled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// ============= ORDER ITEMS =============
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id),
  commerceId: bigint("commerce_id", { mode: "number" }).notNull().references(() => commerces.id),
  productName: varchar("product_name", { length: 200 }).notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;

export type OrderCommerceStatus = typeof orderCommerceStatus.$inferSelect;
export type InsertOrderCommerceStatus = typeof orderCommerceStatus.$inferInsert;

// ============= ORDER STATUS HISTORY =============
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============= ORDER COMMERCE STATUS =============
export const orderCommerceStatus = pgTable("order_commerce_status", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  commerceId: bigint("commerce_id", { mode: "number" }).notNull().references(() => commerces.id, { onDelete: "cascade" }),
  status: orderCommerceStatusEnum("status").default("preparing").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============= CHAT MESSAGES =============
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  senderType: senderTypeEnum("sender_type").notNull(),
  senderId: bigint("sender_id", { mode: "number" }).notNull(),
  senderName: varchar("sender_name", { length: 200 }),
  message: text("message").notNull(),
  isRead: readEnum("is_read").default("no").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// ============= DRIVER EARNINGS =============
export const driverEarnings = pgTable("driver_earnings", {
  id: serial("id").primaryKey(),
  driverId: bigint("driver_id", { mode: "number" }).notNull().references(() => drivers.id, { onDelete: "cascade" }),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: earningsTypeEnum("type").default("delivery_fee").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============= APP SETTINGS =============
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
