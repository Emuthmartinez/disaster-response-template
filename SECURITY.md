# Seguridad

Este documento cubre dos cosas distintas: cómo reportar una vulnerabilidad en
el **código de la plantilla**, y qué significa —en términos de seguridad y
privacidad— **operar un despliegue real** hecho a partir de ella. Si llegaste
aquí porque encontraste un problema en un despliegue específico (no en este
repo de plantilla), contacta directamente a quien lo opera: esta plantilla no
tiene visibilidad ni control sobre forks de terceros.

## Reportar una vulnerabilidad

**No abras una issue pública.** Este repo es público y cualquier detalle de
una vulnerabilidad real —sobre todo una que exponga datos de personas en
crisis— es explotable en cuanto se publica.

- Repórtalo por el canal privado de seguridad del repositorio (GitHub
  Security Advisories: pestaña "Security" → "Report a vulnerability").
- Si tu fork tiene su propio contacto de seguridad, debería vivir en
  `contactEmail` de `config/deployment.config.json` (en esta plantilla,
  ese valor es el placeholder `contacto@example.org`). Cualquiera que
  despliegue este template debería reemplazarlo por un contacto real y
  monitoreado antes de operar en producción — no un correo personal.
- Incluye: qué endpoint/archivo/flujo está afectado, el impacto concreto
  (¿expone PII? ¿permite escritura no autenticada? ¿es un bypass de
  rate-limit?), y pasos para reproducir. No necesitas un exploit completo,
  basta con lo suficiente para que podamos confirmarlo.
- Danos una ventana razonable para corregir antes de cualquier divulgación
  pública (coordinated disclosure). Si no hay respuesta en un tiempo
  razonable, es válido escalar, pero avísanos primero.

## Postura de seguridad de la plantilla

Estos son los controles que la plantilla ya trae, no algo que el deployer
tenga que construir desde cero:

- **Rate limiting en toda ruta.** Cada endpoint del backend (superficie
  pública `backend/src/routes/*` y superficie autenticada
  `backend/src/public-api/*`) declara `rateLimit({ scope, limit })`. Es una
  regla dura, **enforced con
  ESLint** (regla `require-rate-limit` en `backend/eslint-rules/index.js`,
  corre en `npm run lint` + CI): no hay forma de saltarla con un comentario.
  Respaldado por Valkey cuando está configurado; sin él, cae a rate-limit en
  memoria por proceso (degradado pero no ausente).
- **Verificación humana en escrituras públicas (Cloudflare Turnstile).**
  Toda mutación de cara al público (`backend/src/routes/*`) exige `requireHuman`
  (token de Turnstile de un solo uso) o un gate equivalente
  (`requireAdmin` / `requireCapability` / `requireCron` /
  `requireSupplyWrite`), también **enforced con ESLint**
  (`user-facing-mutation-needs-guard`). Sin `TURNSTILE_SECRET_KEY`
  configurada, `requireHuman` se desactiva —esto es intencional para
  desarrollo local, pero significa que en producción esa variable **debe**
  estar presente o las escrituras públicas quedan sin verificación
  anti-bot.
- **RBAC en el panel de administración.** El panel (`admin/`, microservicio
  Next.js separado) y la superficie autenticada del backend
  (`backend/src/public-api/*`) usan JWT en cookie httpOnly + un motor de
  capacidades deny-by-default (`backend/src/auth/capabilities.ts`): cada usuario
  invitado solo puede hacer lo que su rol permite explícitamente, no todo
  salvo lo prohibido. Las API keys de integración llevan **scopes** propios;
  el permiso efectivo es la intersección entre los scopes de la llave y las
  capacidades vivas del usuario que la emitió —ni siquiera el superadmin
  semilla se salta ese techo.
- **IPs nunca en crudo.** Cuando el backend persiste o compara una IP
  (rate-limit, supresión de reportes duplicados), pasa primero por
  `hashIp()` con una sal (`IP_SALT`, obligatoria en producción, ≥32
  caracteres o el server no arranca). No se guardan IPs sin hashear.
- **CORS con allowlist, nunca wildcard.** `CORS_ORIGINS` define
  explícitamente qué orígenes puede llamar al backend; no hay `*`.
- **Cabeceras de seguridad de extremo a extremo.** Caddy (`Caddyfile.example`)
  agrega HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Cross-Origin-Opener-Policy` y una `Permissions-Policy` restrictiva en
  cada sitio; el backend usa `helmet`; el frontend fija su propia CSP en
  `frontend/next.config.ts`.
- **Secretos nunca en el repo.** `.env`/`.env.*` (salvo `.env.example`) están
  en `.gitignore`. Todo secreto de producción se documenta en
  `.env.example` con un placeholder obviamente falso (`CHANGE_ME_...`),
  nunca con un valor real. La skill `disaster-secrets-bootstrap` genera los
  reales con `openssl rand` y se niega a darse por terminada si sobrevive
  un placeholder.
- **Auditoría de contenido continua.** `scripts/content-audit/` (y la skill
  `disaster-content-audit` que lo envuelve) escanea el árbol completo en
  busca de los literales de los que esta plantilla fue depurada —IPs
  reales, correos personales, secretos con forma reconocible, identidad de
  un evento anterior— y devuelve código de salida distinto de cero ante
  cualquier coincidencia. Está pensado para correr en CI en cada PR de tu
  fork, no solo una vez al extraer la plantilla.

## Deployers: van a recopilar PII de personas en crisis

Esto no es opcional ni un detalle secundario: el propósito mismo de este
software es recopilar información sobre personas afectadas por un desastre
—nombres, ubicaciones, estado de salud, contactos familiares, a veces fotos.
Eso es información personal en su forma más sensible, recopilada de personas
que no están en condiciones de dar un consentimiento informado tranquilo.
Operar un despliegue de esta plantilla te hace responsable de esos datos, con
las mismas obligaciones legales y éticas que tendría cualquier organización
que procese datos sensibles de salud y ubicación —GDPR, leyes locales de
protección de datos, o simplemente el estándar ético mínimo de no exponer a
las personas que estás tratando de ayudar a un daño mayor.

Lo que la plantilla impone estructuralmente (arriba) reduce superficie de
ataque técnica. No resuelve estas decisiones, que son tuyas:

- **Minimización de datos.** Solo pide y guarda los campos que tu operación
  realmente necesita para actuar. Cada campo adicional (un documento de
  identidad, una nota médica detallada, una foto de alta resolución con
  metadata EXIF/GPS intacta) es superficie de riesgo si el sistema se ve
  comprometido o si un dato se filtra por error humano. La plantilla ya
  omite campos por defecto (por ejemplo, el hash de deduplicación de
  pacientes nunca guarda el documento crudo fuera de staging) — no agregues
  captura de campos sensibles nuevos sin una razón operativa concreta.
- **Retención.** Define de antemano cuánto tiempo vas a conservar reportes,
  registros de personas localizadas y logs con datos personales después de
  que la fase aguda de la emergencia termine. "Para siempre, por si acaso"
  no es una política de retención — es una decisión no tomada. Documenta la
  tuya y aplícala con un proceso, no de memoria.
- **Acceso.** El RBAC de la plantilla te da el mecanismo (roles y
  capacidades); la disciplina de quién recibe qué rol es tuya. Revisa
  periódicamente quién tiene acceso al panel admin y revoca a quien ya no
  lo necesite (invitaciones y API keys se revocan por soft-delete, no hace
  falta borrar la cuenta).
- **Decommission.** Cuando la operación termine —el desastre pasó, tu
  organización deja de operar el sitio, o migras a otra plataforma— define
  qué pasa con los datos: ¿se anonimizan? ¿se transfieren a una entidad con
  mandato legal de conservarlos (protección civil, salud pública)? ¿se
  destruyen de forma verificable? Esta plantilla no incluye todavía una
  skill de decommission automatizada; hasta que exista, trátalo como un
  runbook manual que debe estar escrito **antes** de que la urgencia de
  apagar el sistema te obligue a improvisarlo.

Si no estás seguro de tus obligaciones legales concretas (qué ley aplica,
cuánto tiempo puedes retener qué campo, si necesitas notificar a un regulador
ante una fuga), consulta a alguien con mandato para responder eso en tu
jurisdicción. Esta plantilla no es asesoría legal.

## Qué NO reportar aquí

Si encontraste datos reales de personas expuestos en un despliegue
específico (no en el código de esta plantilla), ese es un incidente de
privacidad del deployer, no una vulnerabilidad de la plantilla — contacta
directamente a quien opera ese sitio. Si no sabes a quién contactar y el
riesgo es inminente (datos de una persona en crisis expuestos públicamente),
prioriza que la información salga de circulación (por ejemplo, reportando el
contenido a la plataforma donde se expuso) sobre encontrar al responsable.
