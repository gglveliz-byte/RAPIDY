# Brief de producción — Rapidy

**Objetivo:** cerrar el go-live real sin romper los flujos ya verificados de
Cliente, Negocio, Repartidor y Admin.

## Reglas para todos los frentes

- Repo: `C:\Users\HP\OneDrive\Desktop\Rapidy`.
- No reiniciar `localhost:3000`, no ejecutar migraciones ni `db:push`.
- No hacer commits ni cambiar de rama.
- No ejecutar `npm run build` ni suites completas en paralelo; el agente
  principal verifica al final.
- No inventar credenciales ni commitear secretos. Usa `.env.example` y
  placeholders.
- Cada frente tiene archivos asignados. No editar archivos de otro frente.
- Si un cambio requiere un archivo compartido no asignado, documéntalo en el
  entregable y no lo edites.
- El código nuevo debe ser TypeScript válido y no cambiar contratos existentes.
- Los documentos van en `docs/production/`.
- Al terminar, responde máximo 15 líneas: archivos, qué quedó implementado,
  qué falta y cómo verificarlo.

## Estado de partida

- Flujos Cliente/Negocio/Driver/Admin corregidos y verificados.
- Tema claro/oscuro Admin+Driver completo.
- 401 cruzados y mapas corregidos.
- Migraciones `0010` y `0011` aplicadas en local.
- `tsc` 0, tests 9/9, lint 0 errores, build OK.
- Pendientes conocidos: reset de password merchant, auditoría before/after de
  settings, observabilidad, backups, OTP/push/mapas productivos y checklist de
  despliegue.