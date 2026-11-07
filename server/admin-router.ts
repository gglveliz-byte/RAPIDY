/**
 * ==============================================================================
 * ENRUTADOR PRINCIPAL DEL PANEL ADMINISTRATIVO (ADMIN BARREL ROUTER)
 * ==============================================================================
 * Arquitectura modular hexagonal para el panel de administración.
 * Integra los submódulos de dominio (< 300 líneas por módulo) garantizando
 * concurrencia limpia, cero colisiones de agentes y compatibilidad tRPC total:
 * - dashboard-router: Métricas en tiempo real, KPIs y analítica contable
 * - commerces-router: Gestión y auditoría de comercios y credenciales mercantiles
 * - drivers-router: Alta, supervisión, liquidación y control seguro de choferes
 * - orders-router: Desglose contable multi-tienda, actualización y asignación
 * - products-router: Supervisión global y moderación del catálogo
 * - settings-router: Parámetros del sistema y generador de reportes
 * ==============================================================================
 */

import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { verifyAdminRefreshToken, setAdminCookie } from "./admin-auth";

import { adminDashboardProcedures } from "./admin/dashboard-router";
import { adminCommercesProcedures } from "./admin/commerces-router";
import { adminDriversProcedures } from "./admin/drivers-router";
import { adminOrdersProcedures } from "./admin/orders-router";
import { adminProductsProcedures } from "./admin/products-router";
import { adminSettingsProcedures } from "./admin/settings-router";

export const adminRouter = createRouter({
  // Renovación transparente de sesión para administradores
  refresh: publicQuery.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req?.headers?.get?.("cookie") || "";
    const tokenMatch = cookieHeader.match(/quickgo_admin_refresh=([^;]+)/);
    if (!tokenMatch) return { success: false, admin: null };

    const userId = await verifyAdminRefreshToken(tokenMatch[1]);
    if (!userId) return { success: false, admin: null };

    const db = getDb();
    const result = await db.select().from(users).where(eq(users.id, userId));
    if (result.length === 0 || result[0].role !== "admin") {
      return { success: false, admin: null };
    }

    const admin = result[0];
    await setAdminCookie(ctx.resHeaders, ctx.req.headers, admin.id);
    return {
      success: true,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    };
  }),

  // Fusión de submódulos de dominio administrativo
  ...adminDashboardProcedures,
  ...adminCommercesProcedures,
  ...adminDriversProcedures,
  ...adminOrdersProcedures,
  ...adminProductsProcedures,
  ...adminSettingsProcedures,
});
