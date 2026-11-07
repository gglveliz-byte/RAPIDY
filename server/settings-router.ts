import { getDb } from "./queries/connection";
import { appSettings } from "@db/schema";
import { createRouter, publicQuery } from "./middleware";

const PUBLIC_SETTINGS_KEYS = new Set([
  "app_name",
  "support_phone",
  "delivery_fee",
  "min_order_amount",
  "bank_transfer_info",
  "operating_hours",
]);

export const settingsRouter = createRouter({
  getPublic: publicQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(appSettings);
    const map: Record<string, string> = {};
    for (const row of all) {
      if (PUBLIC_SETTINGS_KEYS.has(row.key)) {
        map[row.key] = row.value ?? "";
      }
    }
    return map;
  }),
});
