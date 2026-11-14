/**
 * @archivo src/hooks/useTheme.ts
 * @modulo 00-ui-kernel (Gestión de Tema Claro / Oscuro)
 * @proposito
 *   Hook para gestionar y alternar el tema visual de la aplicación (Dark Velvet / Modo Claro).
 *   Sincroniza la clase 'dark' en el elemento raíz <html>, persiste la preferencia en
 *   localStorage y mantiene sincronizadas todas las instancias montadas del hook.
 *
 * @resumen_contenido
 *   - Store global mínimo con listeners para evitar toggles desincronizados.
 *   - Hook `useTheme`: Retorna `theme`, `isDark`, `toggleTheme` y `setTheme`.
 */

import { useState, useEffect, useCallback } from "react";

const THEME_KEY = "rapidy_theme";

let currentTheme: boolean | null = null;
const listeners = new Set<() => void>();

function readInitialTheme(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored === "dark";
  return document.documentElement.classList.contains("dark");
}

function applyTheme(isDark: boolean) {
  if (typeof window === "undefined") return;
  currentTheme = isDark;
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  listeners.forEach((listener) => listener());
}

function ensureTheme(): boolean {
  if (currentTheme === null) {
    currentTheme = readInitialTheme();
    if (typeof window !== "undefined") {
      document.documentElement.classList.toggle("dark", currentTheme);
    }
  }
  return currentTheme;
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => ensureTheme());

  useEffect(() => {
    const listener = () => setIsDark(ensureTheme());
    listeners.add(listener);
    setIsDark(ensureTheme());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(!ensureTheme());
  }, []);

  const setTheme = useCallback((theme: "dark" | "light") => {
    applyTheme(theme === "dark");
  }, []);

  return {
    theme: isDark ? ("dark" as const) : ("light" as const),
    isDark,
    toggleTheme,
    setTheme,
  };
}