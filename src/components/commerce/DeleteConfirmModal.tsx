import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  productName: string;
  deleting?: boolean;
  error?: string | null;
}

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
      <div className="w-full max-w-xs bg-white rounded-2xl shadow-2xl p-3.5 min-[360px]:p-5 text-center animate-in fade-in zoom-in-95 duration-150">
        <div className="w-10 h-10 min-[360px]:w-12 min-[360px]:h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2.5 text-red-600">
          <AlertTriangle className="w-5 h-5 min-[360px]:w-6 min-[360px]:h-6" />
        </div>
        
        <h3 className="text-sm min-[360px]:text-base font-bold text-slate-800 mb-1">
          ¿Eliminar producto?
        </h3>
        
        <p className="text-[11px] min-[360px]:text-xs text-slate-500 mb-3 leading-relaxed">
          Vas a eliminar <span className="font-semibold text-slate-700">"{productName}"</span>. Esta acción no se puede deshacer.
        </p>

        {error && (
          <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[10px] min-[360px]:text-xs mb-3 text-left">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 h-9 min-[360px]:h-10 rounded-xl border border-slate-200 text-slate-700 text-xs min-[360px]:text-sm font-semibold hover:bg-slate-100 active:scale-98 transition-all"
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
