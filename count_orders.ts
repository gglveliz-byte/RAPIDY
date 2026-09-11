import { getDb } from "./server/queries/connection";
import { orders } from "./db/schema";
import "dotenv/config";
import { sql } from "drizzle-orm";

async function run() {
  const db = getDb();
  
  const allOrders = await db.select().from(orders);
  console.log(`Total orders in DB: ${allOrders.length}`);
  
  if (allOrders.length > 0) {
    console.log("Sample order IDs:", allOrders.slice(0, 5).map(o => o.id));
  } else {
    // Check if there are orders in another schema or if the table is really empty
    const res = await db.execute(sql`SELECT count(*) FROM orders;`);
    console.log("Raw count from table:", res.rows[0]);
  }

  process.exit(0);
}

run().catch(console.error);
