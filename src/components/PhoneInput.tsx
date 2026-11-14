/**
 * @archivo src/components/PhoneInput.tsx
 * @modulo 00-ui-kernel (Componentes Atómicos de Entrada y Selección)
 * @proposito
 *   Componente de entrada telefónica internacional adaptativo (modo claro y oscuro).
 *   Soporta selector de países latinoamericanos y globales con prefijo telefónico,
 *   código ISO visible, sanitización de caracteres numéricos y enfoque accesible.
 *
 * @resumen_contenido
 *   - Componente `PhoneInput`: Menú desplegable flotante de países y entrada de texto numérico.
 *   - Constante `countries`: Matriz de países soportados con código, nombre y código de marcado.
 *   - Manejador de clic exterior: Cierra el menú desplegable al hacer clic fuera del componente.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`ChevronDown`, `Phone`)
 *   - `react` (`useState`, `useRef`, `useEffect`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (UI pura reutilizable en todos los portales de autenticación)
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const countries = [
  { code: "EC", name: "Ecuador", dial: "+593" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "PE", name: "Perú", dial: "+51" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "MX", name: "México", dial: "+52" },
  { code: "BO", name: "Bolivia", dial: "+591" },
  { code: "UY", name: "Uruguay", dial: "+598" },
  { code: "PY", name: "Paraguay", dial: "+595" },
  { code: "VE", name: "Venezuela", dial: "+58" },
  { code: "PA", name: "Panamá", dial: "+507" },
  { code: "CR", name: "Costa Rica", dial: "+506" },
  { code: "GT", name: "Guatemala", dial: "+502" },
  { code: "DO", name: "República Dominicana", dial: "+1-809" },
  { code: "US", name: "Estados Unidos", dial: "+1" },
  { code: "ES", name: "España", dial: "+34" },
  { code: "BR", name: "Brasil", dial: "+55" },
];

function getFlagEmoji(code: string) {
  const offset = 0x1f1e6 - 65;
  return String.fromCodePoint(...code.split("").map(c => c.charCodeAt(0) + offset));
}

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  dark?: boolean;
};

export default function PhoneInput({ value, onChange, error, dark }: PhoneInputProps) {
  const { isDark } = useTheme();
  const themeDark = dark ?? isDark;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(countries[0]);
  const [localNumber, setLocalNumber] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!value) {
      setLocalNumber("");
      return;
    }
    const cleanVal = value.trim();
    const existingDial = countries.find(
      (c) => cleanVal.startsWith(c.dial) || cleanVal.startsWith(c.dial.replace("+", ""))
    );
    if (existingDial) {
      setSelected(existingDial);
      const prefix = cleanVal.startsWith(existingDial.dial)
        ? existingDial.dial
        : existingDial.dial.replace("+", "");
      setLocalNumber(cleanVal.slice(prefix.length).trim());
    } else {
      setLocalNumber(cleanVal);
    }
  }, [value]);

  const handleNumberChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setLocalNumber(cleaned);
    onChange(`${selected.dial} ${cleaned}`);
  };

  const selectCountry = (c: typeof countries[0]) => {
    setSelected(c);
    setOpen(false);
    onChange(`${c.dial} ${localNumber}`);
  };

  return (
    <div>
      <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${themeDark ? "text-zinc-300" : "text-gray-700"}`}>
        Número de celular
      </label>
      <div
        className={`relative flex rounded-2xl transition-all border ${
          themeDark
            ? `bg-[#242426] ${error ? "border-red-500" : "border-white/10"} focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25`
            : `bg-white ${error ? "border-red-400" : "border-gray-200"} focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25`
        }`}
      >
        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`h-13 sm:h-14 px-3 flex items-center gap-2 transition-colors text-sm rounded-l-2xl ${
              themeDark
                ? "bg-[#2a2a2d] hover:bg-[#333337] text-white border-r border-white/10"
                : "bg-gray-50 hover:bg-gray-100 text-gray-800 border-r border-gray-100"
            }`}
          >
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider ${themeDark ? "bg-white/10 text-[#FF6A00]" : "bg-gray-200 text-gray-800"}`}>
              {selected.code}
            </span>
            <span className="font-bold">{selected.dial}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${themeDark ? "text-zinc-400" : "text-gray-400"} ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div
              className={`absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-3rem)] max-h-60 overflow-y-auto rounded-2xl shadow-2xl z-50 border p-1 ${
                themeDark
                  ? "bg-[#1f1f22] border-white/15 text-white"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              {countries.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCountry(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors text-left ${
                    selected.code === c.code
                      ? "bg-[#FF6A00]/20 text-[#FF6A00] font-bold"
                      : themeDark
                      ? "text-zinc-200 hover:bg-white/10"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base">{getFlagEmoji(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-zinc-500 font-mono">{c.dial}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <Phone className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${themeDark ? "text-zinc-500" : "text-gray-400"}`} />
          <input
            type="tel"
            value={localNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder="099 123 4567"
            className={`w-full h-13 sm:h-14 pl-10 pr-4 text-base outline-none rounded-r-2xl font-medium ${
              themeDark
                ? "bg-transparent text-white placeholder-zinc-500"
                : "bg-transparent text-gray-900 placeholder-gray-400"
            }`}
          />
        </div>
      </div>
      <p className={`text-[11px] mt-1.5 ${themeDark ? "text-zinc-400" : "text-gray-400"}`}>
        Selecciona tu país e ingresa tu número móvil
      </p>
    </div>
  );
}
