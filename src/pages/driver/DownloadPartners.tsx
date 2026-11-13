import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";

export default function DownloadPartners() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const installHandler = () => {
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Fallback if browser doesn't support beforeinstallprompt or it hasn't fired
      alert("Para instalar la app, toca los tres puntos (menú) del navegador y selecciona 'Instalar aplicación' o 'Agregar a la pantalla principal'.");
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="mobile-container bg-gray-900 min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src="/logotipo.jpeg"
          alt="Rapidy Socios"
          className="w-32 h-32 object-contain mb-6 rounded-3xl shadow-lg ring-4 ring-gray-800"
        />
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
          RAPIDY <span className="text-gray-400">Socios</span>
        </h1>
        
        {installed ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <CheckCircle2 className="w-16 h-16 text-[#2E7D32] mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">¡Instalación Exitosa!</h2>
            <p className="text-gray-400 text-center text-sm px-4">
              La aplicación de Socios ya está instalada. Puedes cerrar esta ventana y abrirla desde la pantalla de inicio de tu celular para comenzar a trabajar.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-400 text-base mb-10 px-4">
              Descargá la herramienta de trabajo para gestionar tus pedidos, viajes y ganancias directamente desde tu celular.
            </p>
            
            <button
              onClick={handleInstall}
              className="w-full h-14 bg-[#2E7D32] flex items-center justify-center gap-3 text-white font-semibold text-lg rounded-2xl shadow-lg hover:bg-[#1B5E20] active:scale-[0.98] transition-all touch-target border border-[#2E7D32]/20"
            >
              <Download className="w-6 h-6" />
              Descargar App de Socios
            </button>
          </>
        )}
      </div>
    </div>
  );
}
