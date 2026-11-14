# GO-LIVE — Rapidy

**Fecha:** 2026-11-13  
**Veredicto:** **código y flujos listos para staging/product production; el
lanzamiento real queda condicionado a ejecutar el checklist de infraestructura
y cerrar 4 decisiones externas.**

## 1. Estado por área

| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Entorno y secretos | Listo | `env.ts` fail-fast, `.env.example` con 52 variables, `.env.*` ignorados |
| Build y artefactos | Listo | `tsc` 0, tests 9/9, lint 0 errores, build OK |
| Docker | Listo por inspección | Dockerfile multi-stage + healthcheck; **no hay Docker en este host para construir la imagen** |
| Base de datos | Listo en local | 12 migraciones, `db:generate` sin cambios, target PostgreSQL 18.7 verificado |
| Seguridad HTTP | Listo | CSRF Origin/Referer, CSP, HSTS prod, health, cookies Lax/Secure |
| Auth/sesión | Listo | 49/49: refresh revocado, logout por rol, cookies, aislamiento |
| OTP | Listo en código | timeout/retry/fallback; **falta validar contra NeuroChat en staging** |
| Push/FCM | Listo en código | no-op sin credenciales, limpieza de tokens; **falta prueba en dispositivo real** |
| Mapas | Listo | OSM + Nominatim con caché/rate limit; **falta decidir proveedor con SLA para escala** |
| Observabilidad | Parcial | logger/métricas/health smoke 12/12; falta conectar `/api/metrics`, requestId y Sentry/OTel |
| Performance | Baseline | benchmark local; **falta prueba de carga real** |
| Pagos/liquidaciones | Listo | 45/45 finance smoke, snapshot, settlement y transiciones |
| Legal/LOPDP | **Requiere decisión** | borrado de cuenta, tickets de arrepentimiento, retención y textos legales |
| PWA | Listo | manifest, SW versionado, banner montado, sin cache de API |
| Accesibilidad | Listo | 194/194 en 12 rutas Admin/Driver |
| E2E Cliente | Listo | 35/35 (requiere `E2E_OTP_CODE` en CI) |
| E2E Negocio | Listo | 60/60 |
| E2E Driver | Listo | 50/50 |
| E2E Admin | Listo | 68/68 + 2 SKIP por datos |
| Backup/DR | Scripts listos | **falta instalar `pg_dump/pg_restore` y ejecutar el primer drill** |

## 2. Evidencia ejecutada

```bash
npx tsc -b --force                 # 0 errores
npm test                           # 9/9
npm run lint                       # 0 errores, 317 warnings históricos
npm run build                      # OK
npm run db:generate                # No schema changes
node scripts/production-auth-smoke.mjs     # 49/49
node scripts/production-finance-smoke.mjs  # 45/45
node scripts/production-driver-smoke.mjs   # 50/50
node scripts/production-commerce-smoke.mjs # 60/60
node scripts/production-admin-smoke.mjs    # 68/68 + 2 SKIP
node scripts/a11y-smoke.mjs                # 194/194
node scripts/e2e-theme-smoke.mjs           # 50/50
node scripts/production-health-smoke.mjs   # 12/12
node scripts/admin-api-smoke.mjs           # 29/29
node scripts/driver-api-smoke.mjs          # 16/16
node scripts/e2e-driver-smoke.mjs          # 8/8
node scripts/e2e-commerce-smoke.mjs        # 20/20
npx tsx scripts/redirect-smoke.ts          # SESSION SURVIVED: true
```

## 3. Checklist de lanzamiento

### 3.1 Infraestructura

- [ ] Crear DB productiva en PostgreSQL 18+ y verificar versión.
- [ ] Backup inicial + restore de prueba.
- [ ] Aplicar migraciones con `scripts/db-migrate-check.mjs --db` y backup previo.
- [ ] Ejecutar `scripts/db-backup.mjs` y `scripts/db-restore-check.mjs --restore` en staging.
- [ ] Configurar `DATABASE_URL` directa para backups (no pooler).
- [ ] Configurar secretos: `APP_ID`, `APP_SECRET` 32+, `ADMIN_EMAIL`,
      `ADMIN_PASSWORD` 12+, `NEUROCHAT_API_KEY`, Firebase.
- [ ] Configurar `APP_ORIGIN`/`TRUSTED_ORIGINS`, HTTPS y proxy con SSE sin buffering.
- [ ] Configurar `VITE_NOMINATIM_BASE_URL` y `VITE_NOMINATIM_EMAIL` en build.
- [ ] Rotar la contraseña del admin inicial.
- [ ] Deshabilitar seed de demo y `OTP_DEV_FALLBACK` en producción.

### 3.2 Validación en staging

- [ ] `curl /api/health` → `{status:"ok"}`.
- [ ] Login real de los 4 roles con cookies `Secure`.
- [ ] OTP real con NeuroChat y plan B documentado.
- [ ] Push en un Android/iOS real.
- [ ] PWA instalable, SW actualiza y no sirve API cacheada.
- [ ] Mapa y geocodificación con tráfico realista.
- [ ] Correr los 6 smokes de producción contra staging.
- [ ] Correr `scripts/load-test.mjs` y registrar baseline.
- [ ] Probar restore completo y rollback de la app.

### 3.3 Decisiones de negocio/legales

- [ ] Aprobar textos legales con abogado (LOPDP, retención, cookies).
- [ ] Implementar borrado real de cuenta y cola de tickets (hoy solo registra).
- [ ] Backend para arrepentimiento/reclamos (hoy `localStorage`).
- [ ] Definir retención de PII en pedidos/chat y consentimiento de alergias.
- [ ] Definir si habrá pasarela de pago o solo transferencia manual.
- [ ] Contratar/decidir proveedor de mapas con SLA si el volumen lo exige.

### 3.4 Observabilidad y operación

- [ ] Conectar `server/lib/logger.ts` a Sentry/OTel o plataforma equivalente.
- [ ] Exponer `/api/metrics` solo en red interna con token.
- [ ] Configurar alertas: 5xx, latencia, DB, OTP, SSE y push.
- [ ] Configurar backups automáticos, retención y alerta de fallo.
- [ ] Documentar on-call, rollback y restauración.

## 4. Bloqueantes reales que quedan

1. **Legal/LOPDP:** el borrado de cuenta no borra pedidos/chat ni tiene cola
   admin; los reclamos/arrepentimiento no llegan a backend. No lanzar con
   clientes reales sin resolverlo.
2. **Infraestructura:** migraciones, backups, HTTPS, secretos y DNS no se
   ejecutaron en un entorno real.
3. **Staging de terceros:** OTP NeuroChat, push FCM y mapas con SLA no se
   validaron fuera de local.
4. **Observabilidad externa:** logger/métricas existen, pero no están conectados
   a un proveedor de errores/métricas.

## 5. Orden recomendado

```text
1. Staging DB + backup/restore
2. Secretos + HTTPS + health
3. Migraciones + smokes de producción
4. OTP/push/mapas reales
5. Legal + borrado de cuenta
6. Carga + observabilidad
7. Go-live con rollback probado
```

**No ejecutes el paso 7 hasta que los bloques 1–4 estén en verde.**