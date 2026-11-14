import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Settings,
  DollarSign,
  Save,
  CheckCircle,
  Download,
  FileSpreadsheet,
  FileText,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useGetAdminReports, trpcMutate } from "@/hooks/useDeliveryData";
import { queryClient, trpc } from "@/providers/trpc";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import AdminLayout from "@/components/AdminLayout";

function guayaquilDateKey(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [settings, setSettings] = useState({
    deliveryFee: "2.50",
    minOrderAmount: "5.00",
    appName: "RAPIDY",
    supportPhone: "555-HELP",
    bankTransferInfo: "",
  });
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const settingsQuery = trpc.admin.settings.useQuery();
  const getReports = useGetAdminReports();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!settingsQuery.data) return;
    const map: Record<string, string> = {};
    settingsQuery.data.forEach((row: any) => { map[row.key] = row.value ?? ""; });
    setSettings({
      deliveryFee: map.delivery_fee || "2.50",
      minOrderAmount: map.min_order_amount || "5.00",
      appName: map.app_name || "RAPIDY",
      supportPhone: map.support_phone || "555-HELP",
      bankTransferInfo: map.bank_transfer_info || "",
    });
    setHasLoadedSettings(true);
  }, [settingsQuery.data]);

  const handleSave = async () => {
    const appName = settings.appName.trim();
    const deliveryFee = Number(settings.deliveryFee);
    const minOrderAmount = Number(settings.minOrderAmount);
    if (!appName) {
      toast.error("El nombre de la app es obligatorio.");
      return;
    }
    if (
      !Number.isFinite(deliveryFee) ||
      deliveryFee < 0 ||
      deliveryFee > 100_000 ||
      !Number.isFinite(minOrderAmount) ||
      minOrderAmount < 0 ||
      minOrderAmount > 100_000
    ) {
      toast.error("El costo de envío y el mínimo deben ser números positivos.");
      return;
    }

    setSaving(true);
    try {
      await trpcMutate("admin.updateSettingsBulk", {
        settings: [
          { key: "app_name", value: appName },
          { key: "support_phone", value: settings.supportPhone.trim() },
          { key: "delivery_fee", value: Number(settings.deliveryFee).toFixed(2) },
          { key: "min_order_amount", value: Number(settings.minOrderAmount).toFixed(2) },
          { key: "bank_transfer_info", value: settings.bankTransferInfo.trim() },
        ],
      });
      await utils.admin.settings.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Configuración guardada.");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (type: string, format: "pdf" | "excel") => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setExporting(`${type}:${format}`);
    try {
      const payload: { type: string; startDate?: string; endDate?: string } = { type };
      if (dateFrom) payload.startDate = dateFrom;
      if (dateTo) payload.endDate = dateTo;
      const data = await getReports.mutateAsync(payload);
      const today = guayaquilDateKey();
      const rowsCount = Array.isArray(data?.rows) ? data.rows.length : 0;
      if (rowsCount === 0) {
        toast("El reporte no tiene datos para ese rango.");
      }

      if (format === "pdf") {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`${settings.appName || "RAPIDY"} — Reporte de ${type}`, 14, 18);
        doc.setFontSize(10);
        const rangeText =
          dateFrom || dateTo
            ? `Rango: ${dateFrom || "—"} a ${dateTo || "—"}`
            : "Rango: todos los datos";
        doc.text(rangeText, 14, 26);

        const rows: Record<string, unknown>[] = Array.isArray(data?.rows) ? data.rows : [];
        const headers = Array.isArray(data?.columns) ? data.columns : (rows.length > 0 ? Object.keys(rows[0]) : ["Sin datos"]);
        const body = rows.map((row) =>
          headers.map((h: string) => {
            const val = (row as Record<string, unknown>)[h];
            return val === null || val === undefined ? "" : String(val);
          }),
        );

        autoTable(doc, {
          head: [headers],
          body,
          startY: 32,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [46, 125, 50] },
        });

        const pageCount = doc.getNumberOfPages();
        const timestamp = new Date().toLocaleString();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.text(
            `Generado: ${timestamp}  |  Página ${i} de ${pageCount}`,
            14,
            doc.internal.pageSize.height - 8,
          );
        }

        doc.save(`reporte_${type}_${today}.pdf`);
      } else {
        const excelRows: Record<string, unknown>[] = Array.isArray(data?.rows) ? data.rows : [];
        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type);
        XLSX.writeFile(wb, `reporte_${type}_${today}.xlsx`);
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo generar el reporte.");
    } finally {
      setExporting(null);
    }
  };

  const handleLogout = async () => {
    await trpcMutate("login.logout", { scope: "admin" }).catch(() => {});
    clearRoleUser("admin");
    clearSession("admin");
    dispatchLogout("admin");
    queryClient.clear();
    navigate("/login");
  };

  return (
    <AdminLayout>
      <div className="flex flex-1 flex-col min-h-full bg-[#F7F7FA] dark:bg-[#0A0A0D]">
        <header className="bg-white dark:bg-[#111115] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <button type="button" onClick={() => navigate("/admin")} aria-label="Volver al panel" className="touch-target shrink-0">
                <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-600 dark:text-zinc-300" />
              </button>
              <h1 className="text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">Configuración</h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className="min-h-11 min-w-11 flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-xl transition-colors border border-red-200 dark:border-red-900/40 shrink-0 shadow-2xs active:scale-95"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <div className="lg:flex-1 lg:overflow-y-auto p-3 sm:p-4 lg:p-6 max-w-2xl mx-auto space-y-4 lg:space-y-6 pb-20 sm:pb-24 lg:pb-8">
          {settingsQuery.isLoading ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20 text-zinc-500 dark:text-zinc-400">
              <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium">Cargando configuración...</p>
            </div>
          ) : settingsQuery.isError ? (
            <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none p-6 text-center border border-red-200 dark:border-red-900/40">
              <p className="text-sm font-bold text-red-700 dark:text-red-400">
                No se pudo cargar la configuración
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{settingsQuery.error.message}</p>
              <button
                type="button"
                onClick={() => settingsQuery.refetch()}
                className="mt-4 min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {saved && (
                <div role="status" aria-live="polite" className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm animate-fade-in shadow-xs">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  <span className="font-semibold">Configuración guardada exitosamente</span>
                </div>
              )}

              {/* App Settings */}
              <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 sm:p-5">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-strong dark:text-brand" />
                  General
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                  Configura los datos principales que los usuarios verán en la aplicación, como el nombre de tu marca y el teléfono de atención al cliente.
                </p>
                <div className="space-y-3.5 sm:space-y-4">
                  <div>
                    <label htmlFor="settings-app-name" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Nombre de la app</label>
                    <input
                      id="settings-app-name"
                      type="text"
                      value={settings.appName}
                      onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                      className="w-full h-11 px-4 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-support-phone" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Teléfono de soporte</label>
                    <input
                      id="settings-support-phone"
                      type="text"
                      value={settings.supportPhone}
                      onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                      className="w-full h-11 px-4 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Settings */}
              <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 sm:p-5">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-brand-strong dark:text-brand" />
                  Financiero
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                  Establece las reglas de dinero globales: cuánto cuesta el envío base por defecto y el pedido mínimo permitido. Las comisiones se configuran individualmente en cada comercio.
                </p>
                <div className="space-y-3.5 sm:space-y-4">
                  <div>
                    <label htmlFor="settings-delivery-fee" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Costo de envío base ($)</label>
                    <input
                      id="settings-delivery-fee"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100000}
                      step="0.01"
                      value={settings.deliveryFee}
                      onChange={(e) => setSettings({ ...settings, deliveryFee: e.target.value })}
                      className="w-full h-11 px-4 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-min-order" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Monto mínimo de pedido ($)</label>
                    <input
                      id="settings-min-order"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100000}
                      step="0.01"
                      value={settings.minOrderAmount}
                      onChange={(e) => setSettings({ ...settings, minOrderAmount: e.target.value })}
                      className="w-full h-11 px-4 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Transfer Settings */}
              <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 sm:p-5">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-brand-strong dark:text-brand" />
                  Datos de Transferencia Bancaria
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                  Escribe aquí el banco, número de cuenta, titular y RUC. Esta información aparecerá para los clientes cuando decidan pagar un pedido por transferencia bancaria.
                </p>
                <div className="space-y-3.5 sm:space-y-4">
                  <div>
                    <label htmlFor="settings-bank-info" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">
                      Instrucciones para clientes (Banco, Cuenta, Titular, RUC)
                    </label>
                    <textarea
                      id="settings-bank-info"
                      value={settings.bankTransferInfo}
                      onChange={(e) => setSettings({ ...settings, bankTransferInfo: e.target.value })}
                      placeholder="Ej: Banco Pichincha, Cuenta: 123..., Titular: Juan Pérez, RUC: 1712345678001"
                      rows={4}
                      className="w-full p-3.5 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !hasLoadedSettings}
                className="w-full h-11 sm:h-12 bg-brand text-zinc-950 font-semibold rounded-xl hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0A0A0D] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-sm shadow-brand/20"
              >
                <Save className="w-4 h-4" />
                {saving ? "Guardando..." : "Guardar configuración"}
              </button>

              {/* Reports Export */}
              <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 sm:p-5">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                  <Download className="w-4 h-4 text-brand-strong dark:text-brand" />
                  Reportes exportables
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                  Genera reportes de ventas, comisiones o ganancias en formato PDF o Excel. Puedes filtrar por fechas específicas para descargar solo lo que necesitas.
                </p>

                {/* Date range inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label htmlFor="settings-date-from" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Desde</label>
                    <input
                      id="settings-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full h-11 px-3 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-date-to" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Hasta</label>
                    <input
                      id="settings-date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full h-11 px-3 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="space-y-2.5 sm:space-y-3">
                  {[
                    { label: "Ventas", type: "sales" },
                    { label: "Pedidos", type: "orders" },
                    { label: "Comercios", type: "commerces" },
                    { label: "Repartidores", type: "drivers" },
                    { label: "Ganancias", type: "earnings" },
                    { label: "Comisiones", type: "commissions" },
                  ].map((report) => (
                    <div key={report.type} className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-24 sm:w-28 shrink-0">{report.label}</span>
                      <button
                        type="button"
                        onClick={() => handleExport(report.type, "pdf")}
                        disabled={Boolean(exporting)}
                        className="flex-1 min-h-[44px] px-2.5 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 hover:border-brand dark:hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-2xs dark:shadow-none disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand-strong dark:text-brand" />
                        {exporting === `${report.type}:pdf` ? "Generando..." : "PDF"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(report.type, "excel")}
                        disabled={Boolean(exporting)}
                        className="flex-1 min-h-[44px] px-2.5 bg-white dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 hover:border-brand dark:hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-2xs dark:shadow-none disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-brand-strong dark:text-brand" />
                        {exporting === `${report.type}:excel` ? "Generando..." : "Excel"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logout Card */}
              <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 shadow-xs dark:shadow-none">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-red-900 dark:text-red-300">Sesión de Administrador</h3>
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">Cierra tu sesión en este dispositivo</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="min-h-11 flex items-center gap-1.5 px-3.5 py-2 bg-red-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-red-700 active:scale-95 transition-all shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
