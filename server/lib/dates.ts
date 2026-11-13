const GUAYAQUIL_TZ = "America/Guayaquil";

/**
 * Fecha calendario en la zona operativa del negocio.
 * Se usa para earnings, reportes y agrupaciones que no deben depender de UTC.
 */
export function guayaquilDateKey(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GUAYAQUIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}