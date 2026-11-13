import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";

export default function DownloadApp() {
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
    <div className="mobile-container bg-white min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src="/logotipo.jpeg"
          alt="Rapidy"
          className="w-32 h-32 object-contain mb-6 rounded-3xl shadow-sm"
        />
        <h1 className="text-3xl font-bold text-brand mb-3 tracking-tight">
          RAPIDY
        </h1>
        
        {installed ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">¡Instalación Exitosa!</h2>
            <p className="text-gray-500 text-center text-sm px-4">
              La aplicación ya está instalada en tu dispositivo. Puedes cerrar esta ventana y abrir Rapidy desde tu pantalla de inicio.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-base mb-10 px-4">
              Descargá nuestra aplicación para acceder más rápido y pedir lo que quieras en minutos.
            </p>
            
            <button
              onClick={handleInstall}
              className="w-full h-14 bg-brand flex items-center justify-center gap-3 text-white font-semibold text-lg rounded-2xl shadow-lg hover:bg-brand-strong active:scale-[0.98] transition-all touch-target"
            >
              <Download className="w-6 h-6" />
              Descargar App
            </button>
          </>
        )}
      </div>
    </div>
  );
}
