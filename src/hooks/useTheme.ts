/**
 * @archivo src/hooks/useTheme.ts
 * @modulo 00-ui-kernel (Gestión de Tema Claro / Oscuro)
 * @proposito
 *   Hook para gestionar y alternar el tema visual de la aplicación (Dark Velvet / Modo Claro).
 *   Sincroniza la clase 'dark' en el elemento raíz <html> y persiste la preferencia en localStorage.
 *
 * @resumen_contenido
 *   - Hook `useTheme`: Retorna `theme`, `isDark`, `toggleTheme` y `setTheme`.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`, `useCallback`)
 */

import { useState, useEffect, useCallback } from "react";

const THEME_KEY = "rapidy_theme";

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored === "dark";
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem(THEME_KEY, "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem(THEME_KEY, "light");
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const setTheme = useCallback((theme: "dark" | "light") => {
    setIsDark(theme === "dark");
  }, []);

  return {
    theme: isDark ? ("dark" as const) : ("light" as const),
    isDark,
    toggleTheme,
    setTheme,
  };
}
