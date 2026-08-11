# Runbook — Panel admin

Guía operativa del panel de administración (`admin/`): cómo onboardear
usuarios, qué significan los roles y capacidades, cómo operar cada pantalla
del día a día, y dónde mirar cuando algo no cuadra. Para arquitectura y
convenciones de código del panel, ver `admin/AGENTS.md`.

## Dos capas de identidad

El panel separa dos preguntas distintas, resueltas por dos mecanismos
distintos:

1. **¿Quién llega siquiera al formulario de login?** — capa de borde,
   **opcional**. Si pones un proxy de identidad delante del panel (p.ej.
   Cloudflare Access con OTP por email contra una allowlist), esta capa
   decide quién puede ver la pantalla de login en absoluto. No todo
   despliegue la necesita — un panel con un buen RBAC interno y una
   contraseña fuerte es una postura razonable para un equipo pequeño.
2. **¿Qué puede hacer una vez adentro?** — RBAC de la app, **siempre
   presente**. JWT en cookie httpOnly + motor de capacidades deny-by-default
   (`backend/src/auth/capabilities.ts`): cada usuario invitado solo puede
   hacer lo que su rol permite explícitamente.

Si usas la capa de borde: agregar un teammate es un proceso de **dos pasos**,
no uno — permitir su email en la política de borde, **y por separado**
invitarlo desde la pantalla `/users` del panel. Falta cualquiera de los dos y
la persona no entra (o entra pero no ve nada).

**Requisito si usas Access (o similar) en frente del panel:** tu deploy
workflow probablemente hace un smoke check post-deploy contra
`/api/health` (o el endpoint de salud que uses). Ese endpoint necesita un
**bypass explícito** en la política de borde, o el smoke check ve un
redirect al login en vez de un `200` y el deploy se reporta como roto sin
estarlo.

## Onboarding de un usuario nuevo

1. Un admin con capacidad `user:invite` crea la invitación desde `/users`
   (email + rol).
2. El backend arma el link de activación apuntando a **`ADMIN_BASE_URL`**
   (no `APP_BASE_URL`, que es el sitio público) — `/invite/<token>`. Si
   `ADMIN_BASE_URL` no está configurada, revisa el fallback documentado en
   `.env.example`; un invite que apunta al sitio público en vez del panel es
   un 404 silencioso para la persona invitada.
3. Con SMTP/Resend configurado (ver
   `docs/runbook-cloudflare-launch.md` → Fase 10), el link sale por correo.
   Sin SMTP, el link se devuelve en la respuesta de la API — cópialo a mano
   para dev/pruebas.
4. La persona invitada abre el link, activa su cuenta (contraseña propia) y
   queda con el rol que le asignaste — no antes.
5. Revoca acceso por soft-delete (`user:delete`), no necesitas borrar la
   cuenta para quitarle el acceso.

## Roles y capacidades

Las capacidades son `<recurso>:<verbo>`. Los recursos CRUD (`report`,
`missing`, `pet`, `hospital`, `patient`, `donation`, `chat`, `contact`, …)
usan los verbos `read | create | edit | delete`; algunos recursos tienen
verbos propios que no encajan en CRUD plano (`patient:import`, `user:invite`,
`role:edit`, `grant:manage`, `audit:read`, `apikey:manage`,
`mirror:manage`, `deletion:edit`, …). El catálogo completo y sus
descripciones viven en `backend/src/auth/capabilities.ts` — es la fuente de
verdad, no esta tabla.

| Rol de ejemplo | Pensado para | Capacidades típicas |
| --- | --- | --- |
| Superadmin (semilla) | El primer operador, siempre existe | todas — no tiene techo |
| Admin general | Operación diaria completa | CRUD de todos los recursos + `user:*` + `role:read` |
| Rol acotado (p.ej. "hospitales") | Un equipo que solo debe tocar una parte | CRUD de `hospital`/`patient` + `patient:import`, nada de `user:*`/`role:*` |

Define tus propios roles acotados por función real del equipo, no por
persona — más fácil de auditar y de revocar cuando alguien cambia de rol.

**Minting una capacidad nueva no es instantáneo** — el catálogo de código
solo se sincroniza a la base de datos cuando corre el job de migración+seed,
que es un paso humano, no automático en cada deploy. Ver AGENTS.md →
"Minting una capacidad nueva" antes de bloquear una feature en eso;
casi siempre es más rápido reutilizar una capacidad existente y documentar
por qué.

## Operación diaria — pantallas

### Usuarios y roles (`/users`, `/roles`)

Alta/baja/edición de usuarios, asignación de rol, creación de roles
acotados. Ver "Onboarding" arriba para el flujo de invitación completo.

### Importación de pacientes en lote

Dos modos de entrada: subir un archivo, o pegar JSON crudo. Hay un tope de
preflight del lado del cliente (unos ~2.8 MB) antes de intentar mandarlo al
servidor — un archivo más grande se rechaza antes de salir del navegador,
no después. La tabla de revisión por fila clasifica cada registro como
válido, duplicado, inválido o "necesita revisión" antes de aplicar nada —
revisa esa clasificación fila por fila, no confíes en el resumen agregado
para decidir si aplicar. El estado de aplicación se consulta por polling; no
cierres la pestaña a mitad de una importación grande.

### Tablero de insumos hospitalarios

Ordenado por urgencia primero: rojo (crítico) > amarillo > estado
desconocido > verde, y dentro de cada nivel, por cantidad de necesidades
activas. El panel de detalle editable requiere la capacidad de edición del
recurso hospital/insumos — un usuario con solo lectura ve el tablero pero no
puede tocar el detalle. Cada cambio queda en la bitácora de auditoría
(`audit:read` para verla).

### Solicitudes de eliminación de datos

Esta pantalla **no crea** solicitudes — solo llegan desde el formulario
público de cara al ciudadano. Los operadores solo resuelven o rechazan. El
texto de jurisdicción/ley aplicable (p.ej. una ley local de protección de
datos) es swappable por despliegue — no lo hardcodees si tu fork opera en
otra jurisdicción.

## Desarrollo local contra una API remota

```bash
COOKIE_SECURE=false EMERGENCY_API_URL=<url-de-api-staging> npm run dev
```

`COOKIE_SECURE=false` es imprescindible en local: sin eso, la cookie de
sesión no se fija sobre `http://localhost` y el login parece "no hacer
nada". En producción, `COOKIE_SECURE` debe ser `true` siempre.

## Problemas conocidos

<!--
  Plantilla de sección — cada despliegue real la va llenando con SUS
  problemas conocidos a medida que aparecen, con fecha y estado. No la
  borres al desplegar: es el lugar donde un futuro operador (humano o
  agente) espera encontrar "ah, esto ya se sabía".

  Formato sugerido por entrada:

  ### <título corto> (detectado YYYY-MM-DD)
  **Estado:** activo / mitigado / resuelto en <fecha/versión>
  Qué pasa, por qué, y qué hacer mientras tanto.
-->

- **Frescura de jobs de fondo.** El panel no tiene hoy una vista propia de
  "¿los jobs de sincronización siguen corriendo?" — usa
  `scripts/verify-jobs.sh [staging|production]` (chequeo de solo lectura,
  seguro de correr contra producción) para verificar frescura y el tamaño
  de la cola de cartas muertas (DLQ) desde la terminal.
