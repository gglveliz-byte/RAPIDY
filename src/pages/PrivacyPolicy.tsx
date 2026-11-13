/**
 * @archivo src/pages/PrivacyPolicy.tsx
 * @modulo Legal & Compliance - Rapidy Ecuador
 * @proposito
 *   Política de Privacidad oficial de Rapidy exclusiva para la República del Ecuador.
 *   Cumple con la Ley Orgánica de Protección de Datos Personales (LOPDP, Registro Oficial
 *   Suplemento 459 del 26 de mayo de 2021), las directrices de la Superintendencia de
 *   Protección de Datos Personales del Ecuador y los estándares obligatorios de Google Play
 *   Data Safety (cifrado TLS 1.3, retención fiscal SRI y eliminación directa de cuenta).
 *
 * @resumen_contenido
 *   - Componente `PrivacyPolicy`: Vista pública con diseño Dark Velvet `#0E0E12` y acentos
 *     Flame Orange `#FF6A00`, tarjetas luminosas `#F7F7FA` y acordeones interactivos.
 *   - Principios rectores del Art. 10 de la LOPDP (Juridicidad, lealtad, transparencia,
 *     minimización y pertinencia).
 *   - Tratamiento de datos de geolocalización (GPS) en tiempo real con cero rastreo en segundo plano.
 *   - Derechos ARCO+ (Arts. 21 a 26 LOPDP: Acceso, Rectificación, Eliminación, Oposición, Portabilidad).
 *   - Enlace directo al flujo de borrado irreversible en `/eliminar-cuenta`.
 *   - Canales oficiales de atención legal (`privacidad@rapidy.app`).
 *
 * @dependencias_externas
 *   - `react`, `react-router`, `lucide-react`
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Lock,
  MapPin,
  Trash2,
  Eye,
  Mail,
  ChevronDown,
  ChevronUp,
  Server,
  Building2,
  CheckCircle2
} from "lucide-react";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<number | null>(null);

  const toggleSection = (id: number) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const arcoRights = [
    {
      id: "art-21",
      name: "Acceso (Art. 21 LOPDP)",
      desc: "Derecho a conocer de manera gratuita qué datos personales tuyos poseemos, su origen y el tratamiento aplicado."
    },
    {
      id: "art-22",
      name: "Rectificación y Actualización (Art. 22 LOPDP)",
      desc: "Derecho a corregir o completar en cualquier momento información inexacta, desactualizada o incompleta."
    },
    {
      id: "art-23",
      name: "Eliminación / Supresión (Art. 23 LOPDP)",
      desc: "Derecho a exigir la supresión definitiva de tu cuenta y datos cuando hayan dejado de ser necesarios para el servicio."
    },
    {
      id: "art-24",
      name: "Oposición (Art. 24 LOPDP)",
      desc: "Derecho a oponerte a tratamientos específicos de tus datos, como comunicaciones comerciales no deseadas."
    },
    {
      id: "art-25",
      name: "Portabilidad (Art. 25 LOPDP)",
      desc: "Derecho a recibir tus datos en un formato interoperable, estructurado y legible por medios automatizados."
    },
    {
      id: "art-26",
      name: "Suspensión del Tratamiento (Art. 26 LOPDP)",
      desc: "Derecho a pausar temporalmente el uso de tus datos mientras se tramita una rectificación o impugnación legal."
    }
  ];

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-zinc-800 pb-16">
      {/* Cabecera Dark Velvet oficial Rapidy */}
      <header className="sticky top-0 z-30 bg-[#0E0E12] border-b border-white/10 shadow-md">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors text-sm font-semibold cursor-pointer active:scale-95"
              aria-label="Volver a la pantalla anterior"
            >
              <ArrowLeft className="w-5 h-5 text-[#FF6A00]" />
              <span>Volver</span>
            </button>

            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30">
              <span>🇪🇨</span> Ecuador Exclusivo
            </span>
          </div>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-black tracking-wider bg-white/10 text-zinc-300 px-2 py-0.5 rounded-md border border-white/5">
              Marco LOPDP • RO Suplemento 459
            </span>
            <span className="text-[10px] font-medium text-zinc-400">
              Google Play Data Safety
            </span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Política de Privacidad
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Protección de Datos Personales de Rapidy Delivery Ecuador S.A.S. • Vigente desde Noviembre 2026
          </p>
        </div>
      </header>

      {/* Contenido principal sobrepuesto */}
      <main className="max-w-2xl mx-auto px-4 -mt-3 space-y-3.5">
        {/* Banner de Marco Regulatorio Nacional */}
        <section className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center flex-shrink-0 text-[#FF6A00]">
              <Shield className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1">
              <h2 className="font-bold text-zinc-900 text-sm">
                Compromiso y Marco Jurídico Ecuatoriano
              </h2>
              <p className="text-zinc-600 leading-relaxed">
                Esta Política de Privacidad rige exclusivamente en el territorio de la{" "}
                <strong className="text-zinc-900">República del Ecuador</strong> y se fundamenta en la{" "}
                <strong className="text-zinc-900">
                  Ley Orgánica de Protección de Datos Personales (LOPDP)
                </strong>, publicada en el Registro Oficial Suplemento 459 del 26 de mayo de 2021, bajo la tutela de la{" "}
                <strong className="text-zinc-900">
                  Superintendencia de Protección de Datos Personales del Ecuador
                </strong>.
              </p>
            </div>
          </div>
        </section>

        {/* Principios del Tratamiento (Art. 10 LOPDP) */}
        <section className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs">
          <h2 className="text-xs font-black uppercase tracking-wider text-[#FF6A00] mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Principios Rectores (Art. 10 LOPDP)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="font-bold text-zinc-900">Juridicidad y Lealtad</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Tratamos tus datos con apego estricto a la Constitución y leyes ecuatorianas, sin prácticas engañosas.
              </p>
            </div>
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="font-bold text-zinc-900">Finalidad y Transparencia</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Datos recolectados únicamente para los propósitos legítimos y explícitos que te informamos.
              </p>
            </div>
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="font-bold text-zinc-900">Minimización y Pertinencia</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Solo solicitamos los datos estrictamente necesarios para procesar y entregar tu orden.
              </p>
            </div>
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
              <p className="font-bold text-zinc-900">Seguridad y Confidencialidad</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Aplicamos medidas técnicas y organizativas para evitar accesos, alteraciones o filtraciones.
              </p>
            </div>
          </div>
        </section>

        {/* Recolección de Datos y Fines Específicos */}
        <section className="bg-white rounded-2xl p-4 border-l-4 border-l-[#FF6A00] border-y border-r border-zinc-200/80 shadow-xs space-y-3">
          <div>
            <h2 className="text-sm font-black text-zinc-900">
              1. Datos Recopilados y Fines de Uso
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Declaración formal para Google Play Data Safety y LOPDP Ecuador.
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Identidad */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 mb-1">
                <Eye className="w-3.5 h-3.5 text-[#FF6A00]" />
                <span>Identificación y Contacto Operativo</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Nombre, apellido, número telefónico móvil y correo electrónico para crear tu perfil seguro, validar tu sesión mediante OTP y coordinar la entrega con el repartidor.
              </p>
            </div>

            {/* Geolocalización GPS en Tiempo Real */}
            <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-200/60">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
                  <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>Geolocalización en Tiempo Real (GPS)</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF6A00]/15 text-[#FF6A00]">
                  Solo en Uso Activo
                </span>
              </div>
              <p className="text-xs text-zinc-700 leading-relaxed">
                Tu ubicación GPS se consulta <strong>únicamente mientras mantienes la aplicación abierta y tienes un pedido en curso o buscas comercios cercanos</strong>. Se utiliza exclusivamente para:
              </p>
              <ul className="text-xs text-zinc-600 mt-1.5 space-y-1 list-disc list-inside">
                <li>Calcular distancias, tarifas de envío justas y tiempos de entrega estimados.</li>
                <li>Trazar la ruta de despacho hacia tu puerta en el mapa en vivo.</li>
                <li>
                  <strong className="text-zinc-800">Cero rastreo oculto:</strong> Rapidy nunca recopila tu ubicación en segundo plano sin tu consentimiento ni la utiliza para publicidad de terceros.
                </li>
              </ul>
            </div>

            {/* Facturación SRI */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 mb-1">
                <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
                <span>Datos Tributarios y Facturación (SRI Ecuador)</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Número de Cédula o RUC y dirección fiscal cuando solicitas comprobantes con validez tributaria ante el Servicio de Rentas Internas del Ecuador.
              </p>
            </div>
          </div>
        </section>

        {/* Transferencia y Cero Venta de Datos */}
        <section className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs">
          <h2 className="text-sm font-black text-zinc-900 mb-1">
            2. Cero Venta de Datos y Transmisión Operativa
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            <strong className="text-zinc-900">Rapidy no comercializa, no alquila y no comparte tus datos personales con redes publicitarias ni intermediarios de mercadeo.</strong> Tus datos solo se comunican a los actores indispensables para cumplir con tu pedido:
          </p>
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF6A00] flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-900">Comercio Aliado:</strong>
                <p className="text-[11px] text-zinc-500 mt-0.5">Recibe el detalle de tus productos y tu nombre para preparar y empaquetar la orden.</p>
              </div>
            </div>
            <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF6A00] flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-900">Repartidor Asignado:</strong>
                <p className="text-[11px] text-zinc-500 mt-0.5">Accede temporalmente a tu dirección y teléfono de contacto para completar la entrega física.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Derechos ARCO+ (Arts. 21 a 26 LOPDP) */}
        <section className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-zinc-900">
              3. Tus Derechos ARCO+ en Ecuador
            </h2>
            <span className="text-[10px] font-bold text-[#FF6A00] bg-[#FF6A00]/10 px-2 py-0.5 rounded-full">
              Arts. 21-26 LOPDP
            </span>
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed mb-3">
            Como titular ecuatoriano, puedes ejercer cualquiera de los siguientes derechos de forma libre y gratuita comunicándote a nuestros canales oficiales:
          </p>

          <div className="space-y-2">
            {arcoRights.map((right) => (
              <div
                key={right.id}
                className="p-2.5 bg-zinc-50 hover:bg-zinc-100/80 transition-colors rounded-xl border border-zinc-100"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00]"></span>
                  <span>{right.name}</span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-0.5 pl-3 leading-relaxed">
                  {right.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Tarjeta de Solicitud de Eliminación de Cuenta */}
        <section className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-900">
                ¿Deseas dar de baja tu cuenta?
              </h3>
              <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                Art. 23 LOPDP
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
              Solicita la supresión definitiva de tus datos personales conforme a los requisitos de Google Play Store.
            </p>
          </div>

          <button
            onClick={() => navigate("/eliminar-cuenta")}
            className="w-full sm:w-auto px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 flex-shrink-0 cursor-pointer border border-red-200/60"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Eliminar Cuenta</span>
          </button>
        </section>

        {/* Acordeones de Seguridad, Cifrado y Retención Fiscal */}
        <section className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden divide-y divide-zinc-100">
          <div>
            <button
              onClick={() => toggleSection(1)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
              aria-expanded={openSection === 1}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-xs font-bold text-zinc-900">
                  4. Seguridad Técnica y Cifrado (TLS 1.3 / AES-256)
                </span>
              </div>
              {openSection === 1 ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>
            {openSection === 1 && (
              <div className="px-4 pb-4 pt-1 text-xs text-zinc-600 space-y-2 border-t border-zinc-100 bg-zinc-50/50 leading-relaxed">
                <p>
                  Rapidy implementa protocolos criptográficos de grado bancario para salvaguardar tu información:
                </p>
                <ul className="list-disc list-inside space-y-1 text-zinc-600">
                  <li><strong>Datos en Tránsito:</strong> Canales cifrados de extremo a extremo mediante TLS 1.3 y HTTPS con certificados HSTS.</li>
                  <li><strong>Datos en Reposo:</strong> Cifrado de bases de datos mediante el estándar AES-256 en servidores certificados ISO 27001.</li>
                  <li><strong>Tarjetas y Pagos:</strong> Tokenización integral compatible con PCI-DSS; Rapidy nunca almacena números completos de tarjetas de crédito o débito.</li>
                </ul>
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => toggleSection(2)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
              aria-expanded={openSection === 2}
            >
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-xs font-bold text-zinc-900">
                  5. Plazos de Conservación y Retención Fiscal SRI
                </span>
              </div>
              {openSection === 2 ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>
            {openSection === 2 && (
              <div className="px-4 pb-4 pt-1 text-xs text-zinc-600 space-y-2 border-t border-zinc-100 bg-zinc-50/50 leading-relaxed">
                <p>
                  Conservamos tus datos personales únicamente mientras mantengas tu cuenta activa en la plataforma.
                </p>
                <p>
                  <strong>Excepción de Retención Fiscal:</strong> De acuerdo con el Código Tributario del Ecuador y las disposiciones del <strong>Servicio de Rentas Internas (SRI)</strong>, la información de transacciones facturadas debe conservarse durante el plazo legal obligatorio (hasta 7 años) para auditorías fiscales, tras lo cual se anonimiza o destruye de forma segura.
                </p>
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => toggleSection(3)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
              aria-expanded={openSection === 3}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-xs font-bold text-zinc-900">
                  6. Contacto Oficial de Privacidad y Reclamos
                </span>
              </div>
              {openSection === 3 ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>
            {openSection === 3 && (
              <div className="px-4 pb-4 pt-1 text-xs text-zinc-600 space-y-2 border-t border-zinc-100 bg-zinc-50/50 leading-relaxed">
                <p>
                  Para ejercer tus derechos ARCO+, plantear dudas o solicitar aclaraciones sobre el tratamiento de tus datos personales, comunícate con nuestro Oficial de Protección de Datos:
                </p>
                <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                  <p className="text-zinc-900 font-bold">Oficial de Protección de Datos Personales</p>
                  <p className="text-zinc-600">Rapidy Delivery Ecuador S.A.S.</p>
                  <a
                    href="mailto:privacidad@rapidy.app"
                    className="inline-flex items-center gap-1 text-[#FF6A00] font-semibold hover:underline mt-1"
                  >
                    privacidad@rapidy.app
                  </a>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Tiempo máximo de respuesta legal: 48 a 72 horas hábiles conforme a la LOPDP.
                  </p>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Asimismo, tienes derecho a presentar reclamaciones ante la{" "}
                  <strong>Superintendencia de Protección de Datos Personales del Ecuador</strong> si consideras que tus derechos no han sido satisfechos.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Pie de Garantía de Confianza */}
        <footer className="pt-4 pb-2 text-center">
          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-zinc-200 shadow-2xs text-xs text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
            <span>Tus datos y privacidad protegidos por la Ley del Ecuador</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">
            © 2026 Rapidy Ecuador S.A.S. • Todos los derechos reservados.
          </p>
        </footer>
      </main>
    </div>
  );
}
