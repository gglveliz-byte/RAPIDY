import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Download, Store, X } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const IOS_HINT_DELAY_MS = 5000;

export function PWAInstallBanner() {
  const {
    canInstall,
    isInstalled,
    isIos,
    isDismissed,
    install,
    dismiss,
  } = usePWAInstall();
  const [showIosHint, setShowIosHint] = useState(false);
  const location = useLocation();

  const isDownloadPage =
    location.pathname === "/descargar" ||
    location.pathname === "/descargar-socios";

  const isBackoffice =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/driver") ||
    location.pathname === "/commerce" ||
    location.pathname.startsWith("/commerce/orders") ||
    location.pathname.startsWith("/commerce/products") ||
    location.pathname.startsWith("/commerce/stats") ||
    location.pathname.startsWith("/commerce/profile") ||
    location.pathname === "/login" ||
    location.pathname === "/descargar-socios";

  // iOS no dispara beforeinstallprompt: mostramos instrucciones tras un
  // pequeño delay para no interrumpir la primera interacción.
  useEffect(() => {
    if (!isIos || isInstalled || isDismissed) return;

    const timer = window.setTimeout(() => setShowIosHint(true), IOS_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isIos, isInstalled, isDismissed]);

  const isIosFallback = isIos && !canInstall;
  const visible =
    !isDownloadPage &&
    !isInstalled &&
    !isDismissed &&
    (canInstall || (isIos && showIosHint));

  if (!visible) return null;

  const handlePrimary = async () => {
    if (isIosFallback) {
      dismiss();
      return;
    }

    const outcome = await install();
    if (outcome === "dismissed") dismiss();
  };

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-gray-200 dark:border-zinc-800 p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 ${
              isBackoffice
                ? "bg-gray-900 dark:bg-zinc-100"
                : "bg-[#FF6A00] shadow-md shadow-[#FF6A00]/30"
            } rounded-xl flex items-center justify-center flex-shrink-0`}
          >
            {isBackoffice ? (
              <Store className="w-5 h-5 text-white dark:text-zinc-900" />
            ) : (
              <Download className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">
              {isBackoffice ? "Instalá Rapidy Socios" : "Instalá Rapidy en tu celular"}
            </h3>
            <p className="text-xs text-gray-600 dark:text-zinc-400 mb-3">
              {isIosFallback
                ? "Tocá Compartir en Safari y elegí «Agregar a pantalla de inicio»."
                : isBackoffice
                  ? "Gestioná pedidos y ganancias desde tu celular"
                  : "Accedé más rápido y pedí lo que quieras"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePrimary}
                className={`flex-1 h-9 ${
                  isBackoffice
                    ? "bg-gray-900 hover:bg-gray-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900"
                    : "bg-[#FF6A00] hover:bg-[#e65f00] shadow-sm shadow-[#FF6A00]/30"
                } text-white text-sm font-bold rounded-xl transition-all active:scale-95`}
              >
                {isIosFallback ? "Entendido" : "Instalar"}
              </button>
              {!isIosFallback && (
                <button
                  onClick={dismiss}
                  className="h-9 px-3 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Ahora no
                </button>
              )}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Cerrar aviso de instalación"
            className="text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}