/**
 * @archivo src/components/commerce/DeleteConfirmModal.tsx
 * @modulo Comercio - Catálogo de Productos
 * @proposito
 *   Modal de confirmación segura para la eliminación de un producto del catálogo
 *   del comercio con diseño Rapidy y acento de advertencia en rojo suave.
 *
 * @resumen_contenido
 *   - Interfaz `DeleteConfirmModalProps`: Contrato de propiedades del modal.
 *   - Componente `DeleteConfirmModal`: Diálogo modal estilizado con alerta visual,
 *     retroalimentación de error y prevención de clicks concurrentes durante el borrado.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react`: Iconos `AlertTriangle` y `Trash2`.
 */

import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  productName: string;
  deleting?: boolean;
  error?: string | null;
}

/**
 * Modal de confirmación para eliminar un producto del menú de forma destructiva pero segura.
 */
export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  productName,
  deleting = false,
  error = null,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="w-full max-w-xs bg-white dark:bg-[#16161B] rounded-3xl shadow-2xl p-4 min-[360px]:p-5 text-center animate-in fade-in zoom-in-95 duration-150 border border-slate-100 dark:border-white/10">
        <div className="w-11 h-11 min-[360px]:w-12 min-[360px]:h-12 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-100 dark:border-red-900/50 shadow-2xs">
          <AlertTriangle className="w-5 h-5 min-[360px]:w-6 min-[360px]:h-6" />
        </div>
        
        <h3 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 dark:text-white mb-1">
          ¿Eliminar producto?
        </h3>
        
        <p className="text-[11px] min-[360px]:text-xs text-slate-500 dark:text-zinc-400 mb-3.5 leading-relaxed">
          Vas a eliminar <span className="font-semibold text-slate-700 dark:text-zinc-200">"{productName}"</span>. Esta acción no se puede deshacer.
        </p>

        {error && (
          <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl text-[10px] min-[360px]:text-xs mb-3 text-left font-medium">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 h-9 min-[360px]:h-10 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 text-xs min-[360px]:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/10 active:scale-98 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 h-9 min-[360px]:h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs min-[360px]:text-sm font-bold shadow-md shadow-red-600/25 active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {deleting ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
