/**
 * @archivo src/pages/legal/termsData.ts
 * @modulo 08-legal-and-compliance (Datos Normativos de Términos y Condiciones)
 * @proposito
 *   Estructura de datos, cláusulas jurídicas y tipados oficiales para los Términos y
 *   Condiciones de Rapidy en la República del Ecuador 🇪🇨.
 *   Consolida las disposiciones de la LODC (Arts. 4, 15, 45, 47, 50), Ley 2002-67,
 *   normas ARCSA, tributación SRI (IVA 15%) y fuero de mediación en Quito y Guayaquil.
 *
 * @resumen_contenido
 *   - Interfaz `LegalClause` para tipado estricto de cláusulas.
 *   - Catálogo de 10 cláusulas jurídicas ecuatorianas completas y listas para producción.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (iconos temáticos)
 */

import {
  FileText,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Bike,
  Building2,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export interface LegalClause {
  id: number;
  title: string;
  badge: string;
  icon: LucideIcon;
  content: {
    summary: string;
    points: { label: string; text: string }[];
    highlight?: string;
  };
}

export const ECUADOR_LEGAL_CLAUSES: LegalClause[] = [
  {
    id: 1,
    title: "1. Naturaleza del Servicio e Intermediación Tecnológica",
    badge: "Plataforma Digital",
    icon: FileText,
    content: {
      summary:
        "Rapidy es una plataforma tecnológica de intermediación a distancia (marketplace trilateral) que conecta a tres partes independientes en la República del Ecuador.",
      points: [
        {
          label: "Usuarios Consumidores:",
          text: "Personas que emplean la aplicación para solicitar productos y coordinar su adquisición y entrega.",
        },
        {
          label: "Comercios Afiliados:",
          text: "Establecimientos gastronómicos, tiendas de conveniencia y farmacias legalmente domiciliadas en Ecuador que ofertan sus productos de manera autónoma.",
        },
        {
          label: "Repartidores Independientes:",
          text: "Prestadores autónomos de micro-logística que aceptan libremente solicitudes de transporte y entrega por cuenta propia.",
        },
      ],
      highlight:
        "Rapidy Technologies no produce, cocina, manipula alimentos ni presta transporte directo. La calidad bromatológica e inocuidad directa es responsabilidad del comercio aliado.",
    },
  },
  {
    id: 2,
    title: "2. Capacidad Legal, Registro y Cédula de Identidad / RUC",
    badge: "Capacidad Civil",
    icon: CheckCircle2,
    content: {
      summary:
        "El uso de Rapidy en Ecuador exige plena capacidad jurídica civil según las disposiciones del Código Civil ecuatoriano.",
      points: [
        {
          label: "Mayoría de Edad:",
          text: "El usuario declara bajo juramento ser mayor de 18 años y contar con plena aptitud para contratar.",
        },
        {
          label: "Identificación Verificable:",
          text: "Se requiere Cédula de Identidad de la República del Ecuador, RUC vigente o pasaporte legalmente reconocido en el territorio nacional.",
        },
        {
          label: "Custodia de Cuenta:",
          text: "La cuenta es personal e intransferible; el usuario responde por la confidencialidad de sus claves y órdenes generadas.",
        },
      ],
    },
  },
  {
    id: 3,
    title: "3. Precios en Dólares ($ USD), Desglose de IVA (15%) y Facturación SRI",
    badge: "Art. 15 LODC & SRI",
    icon: DollarSign,
    content: {
      summary:
        "Conforme al Art. 15 de la Ley Orgánica de Defensa del Consumidor (LODC), todos los precios se expresan en Dólares de los Estados Unidos de América ($ USD).",
      points: [
        {
          label: "Desglose Transparente:",
          text: "En checkout se desglosa el subtotal del bien, costo de entrega del repartidor, tarifa por servicio de plataforma y el IVA vigente del 15%.",
        },
        {
          label: "Comprobantes Electrónicos SRI:",
          text: "Los comercios afiliados son sujetos pasivos tributarios obligados a emitir facturas electrónicas autorizadas por el SRI.",
        },
        {
          label: "Medios de Pago:",
          text: "Efectivo contra entrega en USD, transferencias bancarias y tarjetas bancarias procesadas con protocolos de seguridad cifrados.",
        },
      ],
      highlight:
        "Sin recargos sorpresa: el valor total detallado previo a pulsar 'Confirmar Pedido' es el monto final vinculante.",
    },
  },
  {
    id: 4,
    title: "4. Inocuidad Alimentaria, Normas ARCSA y Alérgenos",
    badge: "Salud Pública ARCSA",
    icon: AlertCircle,
    content: {
      summary:
        "La salubridad e inocuidad de bienes preparados y farmacéuticos se rige por la Agencia Nacional de Regulación, Control y Vigilancia Sanitaria (ARCSA).",
      points: [
        {
          label: "Responsabilidad Bromatológica:",
          text: "El comercio aliado garantiza contar con permiso de funcionamiento y notificación sanitaria ARCSA, asumiendo la inocuidad, cocción, frescura y empaque.",
        },
        {
          label: "Alérgenos y Restricciones:",
          text: "El usuario debe registrar celiaquía o intolerancias alimentarias en las notas del pedido antes de formalizar la orden.",
        },
        {
          label: "Farmacia y Medicamentos:",
          text: "Solo farmacias licenciadas por ARCSA despachan medicamentos de venta libre. Queda vetada la venta de fármacos con receta especial o controlados.",
        },
      ],
    },
  },
  {
    id: 5,
    title: "5. Rol de Comercios Afiliados y Repartidores Independientes",
    badge: "Deslinde Jurídico",
    icon: Bike,
    content: {
      summary:
        "Rapidy funciona como intermediario neutral entre proveedores mercantiles y transportistas urbanos autónomos.",
      points: [
        {
          label: "Independencia de Comercios:",
          text: "Fijan libremente sus precios, ingredientes, recetas, stock y asumen la garantía de sus productos.",
        },
        {
          label: "Autonomía de Repartidores:",
          text: "Prestan servicios de micro-logística por cuenta propia, sin relación de dependencia laboral con Rapidy, amparados en el Código de Comercio de Ecuador.",
        },
        {
          label: "Rol de Rapidy:",
          text: "Garantiza la operatividad del software, la geolocalización en tiempo real y el canal de resolución de controversias.",
        },
      ],
    },
  },
  {
    id: 6,
    title: "6. Tiempos de Entrega, Recepción y Política de Espera (10 Min)",
    badge: "Logística Urbana",
    icon: Building2,
    content: {
      summary:
        "Las estimaciones de entrega en la app son calculadas en tiempo real en función del tráfico, clima y operatividad del local.",
      points: [
        {
          label: "Monitoreo GPS:",
          text: "El cliente visualiza el avance de preparación y desplazamiento del repartidor en el mapa de la app.",
        },
        {
          label: "Tiempo de Espera en Domicilio:",
          text: "El repartidor aguardará un máximo de diez (10) minutos tras avisar su llegada por timbre, llamada o chat.",
        },
        {
          label: "Ausencia del Destinatario:",
          text: "Superados los 10 minutos sin contacto, el pedido se cancelará por causas imputables al usuario sin derecho a reintegro de alimentos preparados.",
        },
      ],
    },
  },
  {
    id: 7,
    title: "7. Cancelaciones, Devoluciones y Reclamos (Arts. 4, 45, 47 y 50 LODC)",
    badge: "LODC Arts. 4, 45, 47, 50",
    icon: Scale,
    content: {
      summary:
        "Protección integral de los derechos del consumidor ecuatoriano conforme a los artículos 4, 45, 47 y 50 de la LODC.",
      points: [
        {
          label: "Derecho a Cancelar (Art. 47 LODC):",
          text: "Permitido sin costo antes de que el comercio inicie la preparación gastronómica o empaque del pedido.",
        },
        {
          label: "Restitución Inmediata o Reemplazo (Art. 45 LODC):",
          text: "Ante productos incompletos, en mal estado, derramados o no entregados, el usuario accede al reintegro del importe o sustitución sin costo.",
        },
        {
          label: "Plazo de Reclamo (Art. 50 LODC):",
          text: "Debe gestionarse en un plazo máximo de dos (2) horas desde la entrega mediante el botón de Soporte, adjuntando fotografía del paquete.",
        },
      ],
      highlight:
        "Tu derecho a la garantía y compensación está 100% resguardado por la LODC. Incidencias resueltas en menos de 24 horas hábiles.",
    },
  },
  {
    id: 8,
    title: "8. Mensajes de Datos y Consentimiento Digital (Ley 2002-67)",
    badge: "Comercio Electrónico",
    icon: FileText,
    content: {
      summary:
        "Aplicación de la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos (Ley N° 2002-67 de Ecuador).",
      points: [
        {
          label: "Eficacia Legal Probatoria:",
          text: "Las órdenes digitales y confirmaciones telemáticas gozan de idéntico valor legal que los contratos celebrados en papel.",
        },
        {
          label: "Consentimiento Informado:",
          text: "Pulsar 'Realizar Pedido' formaliza el acuerdo de intermediación tecnológica y compraventa a distancia.",
        },
      ],
    },
  },
  {
    id: 9,
    title: "9. Propiedad Intelectual y Reglas de Uso Aceptable",
    badge: "Código INGENIOS",
    icon: ShieldAlert,
    content: {
      summary:
        "El software, código fuente, interfaz, marcas y logotipos de Rapidy están protegidos por el Código INGENIOS de Ecuador.",
      points: [
        {
          label: "Titularidad de Marcas y Algoritmos:",
          text: "Pertenecen exclusivamente a Rapidy Technologies o a sus legítimos licenciantes.",
        },
        {
          label: "Prohibición de Abuso:",
          text: "Prohibido el uso de bots, scraping, emuladores o alteración indebida de GPS para simular ubicaciones.",
        },
      ],
    },
  },
  {
    id: 10,
    title: "10. Jurisdicción, Ley Aplicable y Centros de Mediación en Ecuador",
    badge: "Quito & Guayaquil",
    icon: Scale,
    content: {
      summary:
        "Los presentes términos se someten de manera privativa al ordenamiento jurídico de la República del Ecuador.",
      points: [
        {
          label: "Procedimiento de Mediación Previa:",
          text: "Toda controversia se somete prioritariamente a mediación en Centros acreditados por el Consejo de la Judicatura en Quito o Guayaquil.",
        },
        {
          label: "Justicia Ordinaria:",
          text: "En caso de falta de acuerdo, intervendrán los jueces competentes de lo civil de Quito o Guayaquil, renunciando a otros fueros.",
        },
      ],
      highlight:
        "Jurisdicción territorial: República del Ecuador. Sometimiento ante juzgados y tribunales de Quito o Guayaquil.",
    },
  },
];
