/**
 * @archivo src/components/ThemeToggle.tsx
 * @modulo 00-ui-kernel (Conmutador de Tema Claro / Oscuro)
 * @proposito
 *   Botón interactivo accesible para alternar entre el modo claro y el tema oscuro oficial (Dark Velvet).
 *   Soporta diferentes tamaños (sm, md, lg) e interactúa directamente con `useTheme`.
 *
 * @resumen_contenido
 *   - Componente `ThemeToggle`: Botón animado con iconos de Sol (Sun) y Luna (Moon).
 *
 * @dependencias_internas
 *   - `useTheme` (@/hooks/useTheme)
 *
 * @dependencias_externas
 *   - `lucide-react` (`Sun`, `Moon`)
 */

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({
  size = "md",
  className = "",
  showLabel = false,
}: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: "w-8 h-8 rounded-xl text-xs",
    md: "w-9 h-9 rounded-2xl text-sm",
    lg: "w-11 h-11 rounded-2xl text-base",
  }[size];

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-4.5 h-4.5",
    lg: "w-5 h-5",
  }[size];

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`inline-flex items-center justify-center transition-all cursor-pointer select-none active:scale-90 border shadow-xs ${
        isDark
          ? "bg-white/10 hover:bg-white/15 border-white/15 text-amber-300 hover:text-amber-200"
          : "bg-zinc-100 hover:bg-zinc-200/80 border-zinc-200 text-zinc-700 hover:text-zinc-900"
      } ${sizeClasses} ${className}`}
    >
      {isDark ? (
        <Sun className={`${iconSizes} stroke-[2.2] transition-transform rotate-0 duration-300`} />
      ) : (
        <Moon className={`${iconSizes} stroke-[2.2] transition-transform rotate-0 duration-300`} />
      )}
      {showLabel && (
        <span className="ml-1.5 font-bold text-xs">
          {isDark ? "Claro" : "Oscuro"}
        </span>
      )}
    </button>
  );
}
