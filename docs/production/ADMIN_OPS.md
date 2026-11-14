# Operación Admin — Rapidy

Procedimientos operativos del panel de administración. No incluye credenciales
reales; usa placeholders y canales seguros.

## Reset de contraseña de un merchant

**Cuándo usarlo:** el dueño del negocio olvidó su contraseña o se sospecha un
acceso no autorizado a su cuenta.

**Requisitos:** sesión activa de un usuario con rol `admin` y acceso a la
sección **Comercios**.

### Procedimiento

1. Entrar a **Admin → Comercios**.
2. Ubicar el comercio y pulsar **Editar**.
3. En el bloque **Acceso del merchant**, pulsar **Resetear contraseña**.
4. Confirmar la advertencia: el reset **revoca todas las sesiones activas** del
   merchant.
5. Escribir una contraseña temporal de **8 a 72 caracteres**. No reutilizar la
   contraseña anterior ni una clave personal del admin.
6. Pulsar **Confirmar reset**. La UI solo muestra el email del merchant y un
   mensaje de éxito; la contraseña nunca se vuelve a mostrar ni queda en la
   pantalla.
7. Entregar la contraseña temporal al merchant por un canal seguro (llamada,
   mensaje directo o gestor de secretos). Nunca por canales públicos ni en
   tickets compartidos.
8. El merchant inicia sesión con la contraseña temporal y la cambia desde su
   perfil.

### Comportamiento técnico

- Endpoint: `admin.resetMerchantPassword` (`adminQuery`).
- Entrada: `userId` del merchant y `password` temporal (8–72 caracteres).
- Valida que el usuario exista y tenga rol `merchant`; también exige email de
  acceso.
- Hashea con bcrypt (costo 10). No devuelve ni registra el hash.
- Incrementa `users.sessionVersion` y actualiza `users.updatedAt`, por lo que
  los tokens emitidos antes del reset dejan de ser válidos.
- Respuesta: únicamente `{ success, email }`.
- Auditoría mínima: se escribe en el log del servidor
  `[admin][audit] merchant_password_reset` con `adminId`, `targetUserId` y
  timestamp. No se registra la contraseña ni el hash y no se crea tabla nueva.

### Verificación

1. Confirmar que el merchant anteriormente logueado recibe rechazo de sesión
   (401 / redirección a login).
2. Iniciar sesión con el email del merchant y la contraseña temporal nueva.
3. Confirmar que la contraseña anterior ya no permite iniciar sesión.
4. Revisar el log del servidor y verificar el evento de auditoría sin datos
   sensibles.

### Notas de seguridad

- No usar el reset para cuentas que no sean `merchant`; el endpoint responde
  `NOT_FOUND`.
- Si el comercio no tiene merchant asignado, la acción no aparece en la UI.
- No reiniciar `localhost:3000`, no ejecutar migraciones y no crear tablas para
  este procedimiento.

## Rotación de la contraseña del admin raíz

El `ADMIN_PASSWORD` de Render debe coincidir con el hash real de la tabla
`users`. Cambiar solo la variable de entorno **no** actualiza un admin ya
creado, porque `seedAdminUser` solo inserta si no existe.

Procedimiento:

1. Generar una contraseña aleatoria de 12+ caracteres (sin “admin”, “rapidy”,
   “123456” ni palabras predecibles).
2. Guardarla en el gestor de secretos y en `ADMIN_PASSWORD` de Render.
3. Con `DATABASE_URL` y `ADMIN_EMAIL` de producción:

```bash
ENV_FILE=.env.production node scripts/set-admin-password.mjs
```

El script hashea con bcrypt, actualiza `users.password_hash`, incrementa
`session_version` y revoca todas las sesiones admin. Nunca imprime la
contraseña. Verificar login y que el refresh anterior ya no funcione.