import { useState, useRef, useEffect } from "react";
import { ChevronDown, Phone } from "lucide-react";

const countries = [
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "BO", name: "Bolivia", dial: "+591" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "CR", name: "Costa Rica", dial: "+506" },
  { code: "CU", name: "Cuba", dial: "+53" },
  { code: "DO", name: "República Dominicana", dial: "+1-809" },
  { code: "EC", name: "Ecuador", dial: "+593" },
  { code: "SV", name: "El Salvador", dial: "+503" },
  { code: "GT", name: "Guatemala", dial: "+502" },
  { code: "HN", name: "Honduras", dial: "+504" },
  { code: "MX", name: "México", dial: "+52" },
  { code: "NI", name: "Nicaragua", dial: "+505" },
  { code: "PA", name: "Panamá", dial: "+507" },
  { code: "PY", name: "Paraguay", dial: "+595" },
  { code: "PE", name: "Perú", dial: "+51" },
  { code: "PR", name: "Puerto Rico", dial: "+1-787" },
  { code: "UY", name: "Uruguay", dial: "+598" },
  { code: "VE", name: "Venezuela", dial: "+58" },
  { code: "ES", name: "España", dial: "+34" },
  { code: "US", name: "Estados Unidos", dial: "+1" },
  { code: "CA", name: "Canadá", dial: "+1" },
  { code: "GB", name: "Reino Unido", dial: "+44" },
  { code: "FR", name: "Francia", dial: "+33" },
  { code: "IT", name: "Italia", dial: "+39" },
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
};

export default function PhoneInput({ value, onChange, error }: PhoneInputProps) {
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
    const existingDial = countries.find(c => value.startsWith(c.dial));
    if (existingDial) {
      setSelected(existingDial);
      setLocalNumber(value.slice(existingDial.dial.length).trim());
    } else if (value) {
      setLocalNumber(value);
    }
  }, []);

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
      <label className="text-sm font-medium text-gray-700 mb-1 block">Número de celular</label>
      <div className={`relative flex border rounded-xl focus-within:border-[#2E7D32] focus-within:ring-1 focus-within:ring-[#2E7D32] ${error ? "border-red-400" : "border-gray-200"}`}>
        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="h-12 px-3 flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm rounded-l-xl"
          >
            <span className="text-base">{getFlagEmoji(selected.code)}</span>
            <span className="font-medium text-gray-700">{selected.dial}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute top-full left-0 mt-1 w-64 max-w-[calc(100vw-3rem)] max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-50">
              {countries.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCountry(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${selected.code === c.code ? "bg-green-50 text-[#2E7D32] font-semibold" : "text-gray-700"}`}
                >
                  <span className="text-base">{getFlagEmoji(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{c.dial}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="tel"
            value={localNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder="Ej: 555-123-4567"
            className="w-full h-12 pl-9 pr-4 text-base outline-none rounded-r-xl"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">Seleccioná tu país y escribí tu número</p>
    </div>
  );
}