import { z } from "zod";

/**
 * Validación de entorno en el arranque (fail-fast). Si falta algo crítico, el
 * server NO levanta — mejor que descubrir un undefined en runtime sirviendo a
 * gente en emergencia. Las claves opcionales degradan con gracia (ver notas).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),

  // DB: Postgres TCP (Hetzner VPS). El proyecto ya NO usa Neon.
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),

  // Valkey: OPCIONAL. Sin esto el rate-limit cae a memoria (degradado, no rompe).
  VALKEY_URL: z.string().optional(),

  // Auth.
  ADMIN_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // JWT de la superficie autenticada (api/public/*). Firma HS256. En prod DEBE
  // ser largo (validado abajo). Sin esto en dev, el login/invite no operan.
  JWT_SECRET: z.string().optional(),
  // Vida del access token (segundos). Default 12h (alineado con ResponseGrid).
  JWT_TTL_SECONDS: z.coerce.number().default(43200),
  // Nombre de la cookie httpOnly que lleva el JWT en el navegador.
  AUTH_COOKIE_NAME: z.string().default("mapa_session"),
  // Cookie Secure (HTTPS). En prod SIEMPRE on; en dev local off para http.
  COOKIE_SECURE: z.coerce.boolean().default(false),

  // Invitaciones: base del frontend para construir el link de aceptación.
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  // Caducidad de una invitación (horas).
  INVITE_TTL_HOURS: z.coerce.number().default(72),

  // SMTP para emails de invitación. OPCIONAL: sin SMTP_HOST el invite devuelve
  // el link en la respuesta (dev) en vez de mandar correo. SMTP_FROM sin default
  // real: pon el remitente de tu propio dominio (ejemplo: "Tu Proyecto
  // <noreply@example.org>").
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Disaster Response <noreply@example.org>"),

  // Privacidad: sal para hashear IPs antes de persistir. En prod es OBLIGATORIA
  // (validada abajo, >=32 chars): sin sal, hashIp produce un sha256 crudo de la
  // IP, reversible por fuerza bruta del espacio IPv4 (deanonimización). Opcional
  // aquí para permitir dev/test sin sal (ahí no se persiste data sensible real).
  IP_SALT: z.string().optional(),
  // Privacidad: secreto HMAC para documentos de pacientes importados. Permite
  // dedup exacta sin guardar cédulas/documentos crudos fuera de staging.
  PATIENT_DOCUMENT_HASH_SECRET: z.string().optional(),

  // Cabecera de IP de confianza. Default VACÍO: sin proxy/CDN delante (el
  // deploy por defecto de este template, Caddy directo en un único VPS),
  // NINGUNA cabecera es de confianza → clientIp() cae a req.ip. Si tu deploy
  // pone Cloudflare (u otro proxy que reescriba la cabecera en cada hop)
  // delante, configura explícitamente TRUSTED_IP_HEADER=cf-connecting-ip.
  TRUSTED_IP_HEADER: z.string().default(""),

  // Cloudflare Turnstile (prueba de humanidad en writes públicos). OPCIONAL:
  // sin TURNSTILE_SECRET_KEY el middleware requireHuman se desactiva (dev local).
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Documentación OpenAPI (Swagger UI + /api/openapi.json). Expone TODA la
  // superficie de la API, así que en producción va CERRADA por defecto (evita
  // regalar el mapa de endpoints a un atacante). Se puede reabrir explícitamente
  // en prod poniendo ENABLE_API_DOCS=1 (p. ej. detrás de auth de red). En
  // dev/test siempre está disponible sin tocar nada.
  ENABLE_API_DOCS: z.coerce.boolean().default(false),

  // Bearer token que protege GET /metrics (Prometheus). OPCIONAL: sin él el
  // endpoint queda abierto (dev local). Defensa en profundidad: la defensa
  // PRIMARIA es que /metrics vive en METRICS_PORT, que el LB público NO enruta.
  METRICS_TOKEN: z.string().optional(),
  // Puerto del servidor de métricas separado (aislado del LB público). El api
  // tier expone este containerPort para que Alloy lo scrapee, pero el Service NO
  // lo publica. Default 9090.
  METRICS_PORT: z.coerce.number().default(9090),

  // CORS: orígenes permitidos del frontend (coma-separados). En dev, localhost.
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Colas BullMQ (worker). Opcionales con defaults sanos.
  QUEUE_PREFIX: z.string().default("mapa"),
  QUEUE_REMOVE_ON_COMPLETE: z.coerce.number().default(1000),
  QUEUE_REMOVE_ON_FAIL: z.coerce.number().default(5000),

  // R2 (fotos/CDN): el helper lib/r2.ts lee process.env directo; aquí solo
  // documentamos el prefijo de namespace. Vacío en prod (keys `images/...`);
  // en staging = "staging" para aislar fotos en el MISMO bucket sin pisar prod.
  R2_KEY_PREFIX: z.string().default(""),

  // Proxy de analítica OpenPanel (route op/[...op]). Opcionales.
  OPENPANEL_API_URL: z.string().default("https://api.openpanel.dev"),
  OPENPANEL_CLIENT_SECRET: z.string().optional(),

  // OCR/ICR de importación de pacientes (proveedor VL compatible con OpenAI).
  // DESACTIVADO por defecto: sin ENABLE_PATIENT_OCR=true, el endpoint de import
  // rechaza contentType image/* con 501 aunque haya credenciales cargadas. Si se
  // activa, MINIMAX_API_KEY y MINIMAX_OCR_BASE_URL son obligatorias (se valida
  // más abajo, fail-fast en el arranque). El token es SOLO server-side: nunca se
  // loguea ni se expone en respuestas. El endpoint, el modelo (VL), el prompt, el
  // máximo de tokens y el timeout son parametrizables para cambiar de proveedor
  // sin redeploy — SIN default apuntando a un vendor real: configura el de tu
  // proveedor (ejemplo: https://api.example.org/v1).
  ENABLE_PATIENT_OCR: z.coerce.boolean().default(false),
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_OCR_BASE_URL: z.string().optional(),
  MINIMAX_OCR_MODEL: z.string().default("generic-vl-model"),
  MINIMAX_OCR_MAX_TOKENS: z.coerce.number().int().positive().default(2048),
  MINIMAX_OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MINIMAX_OCR_PROMPT: z.string().optional(),

  // --- Módulos ResponseGrid (needs + acopio) — RFC "gating", OFF por defecto ---
  // Sin ENABLE_RESPONSEGRID=true, ni el router /api/needs ni /api/acopio se
  // montan en el composition root (server.ts): 404 en vez de una integración a
  // medio configurar. Si se activa, RESPONSEGRID_API_URL y
  // RESPONSEGRID_EMERGENCY_SLUG son obligatorios (se valida más abajo, fail-fast
  // en el arranque nombrando la var que falte).
  ENABLE_RESPONSEGRID: z.coerce.boolean().default(false),
  // API externa de centros de acopio / necesidades (logística humanitaria). El
  // backend la PROXEA en /api/acopio (cache + rate-limit + ETag); el navegador
  // NUNCA la llama directo. SIN default: pon la URL de tu propio proveedor
  // (ejemplo: https://api.example.org) y el slug de tu emergencia/evento.
  RESPONSEGRID_API_URL: z.string().optional(),
  RESPONSEGRID_EMERGENCY_SLUG: z.string().optional(),
  // api-key de service account de ResponseGrid para PUBLICAR (escritura:
  // necesidades, /api/needs). Se envía como cabecera `x-api-key` junto al campo
  // `author` (atribución a la persona real). Las lecturas (acopio) no la necesitan.
  // Ausente => publicar queda deshabilitado y el endpoint responde 503.
  RESPONSEGRID_API_KEY: z.string().optional(),

  // --- Réplica pública (hub SQL, RFC 0006). Todo OPCIONAL: si falta, la gestión
  // de la réplica queda desactivada (el endpoint responde 503), igual que
  // Turnstile sin secret en dev. Se setean cuando el hub está provisto (tofu). ---
  // Conexión del rol CREATEROLE del backend hacia el hub (red privada). Es la
  // que crea/borra roles de consumidor. Output tofu `hub_admin_url`.
  HUB_ADMIN_DATABASE_URL: z.string().optional(),
  // Host PÚBLICO del hub que se entrega al consumidor en la cadena de conexión.
  HUB_PUBLIC_HOST: z.string().optional(),
  HUB_DB_NAME: z.string().default("public_db"),
  // Token Hetzner con permiso de escribir firewalls (idealmente scoped). Se usa
  // para abrir/cerrar la IP del consumidor en el firewall del hub.
  HCLOUD_TOKEN: z.string().optional(),
  // id (numérico) del firewall del hub a editar. Output del firewall en HCloud.
  HUB_FIREWALL_ID: z.coerce.number().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Config de entorno inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Fail-fast de seguridad: en prod, un JWT_SECRET ausente o corto es una falla de
// configuración crítica (tokens forjables). Validado en TODOS los envs distintos
// de test para no descubrirlo en runtime sirviendo a gente en emergencia.
if (env.NODE_ENV === "production") {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    console.error("❌ JWT_SECRET es obligatorio y debe tener >=32 caracteres en producción.");
    process.exit(1);
  }
  if (!env.PATIENT_DOCUMENT_HASH_SECRET || env.PATIENT_DOCUMENT_HASH_SECRET.length < 32) {
    console.error(
      "❌ PATIENT_DOCUMENT_HASH_SECRET es obligatorio y debe tener >=32 caracteres en producción.",
    );
    process.exit(1);
  }
  if (!env.COOKIE_SECURE) {
    console.error("❌ COOKIE_SECURE debe estar activo en producción (cookies de sesión sobre HTTPS).");
    process.exit(1);
  }
  // IP_SALT: sin sal, los ip_hash persistidos (contacto/donaciones/psychology/
  // reports) son sha256 crudos de la IP → reversibles por rainbow table del
  // espacio IPv4. En un contexto humanitario eso deanonimiza a víctimas y
  // donantes. Se exige igual que los otros secretos: presente y >=32 chars.
  if (!env.IP_SALT || env.IP_SALT.length < 32) {
    console.error("❌ IP_SALT es obligatorio y debe tener >=32 caracteres en producción (hash de IP no reversible).");
    process.exit(1);
  }
}

// Fail-fast de gating: los módulos opcionales (ResponseGrid, OCR de pacientes)
// están OFF por defecto. Si alguien los enciende con el flag pero no completó su
// config, es mejor morir en el arranque con un mensaje accionable que responder
// 503/501 en producción sin explicación. Se valida en TODOS los envs (el flag
// por defecto es false, así que test/dev nunca disparan esto sin querer).
if (env.ENABLE_RESPONSEGRID) {
  const missing = [
    !env.RESPONSEGRID_API_URL && "RESPONSEGRID_API_URL",
    !env.RESPONSEGRID_EMERGENCY_SLUG && "RESPONSEGRID_EMERGENCY_SLUG",
  ].filter(Boolean);
  if (missing.length) {
    console.error(
      `❌ ENABLE_RESPONSEGRID=true requiere: ${missing.join(", ")}. ` +
        "Ejemplo: RESPONSEGRID_API_URL=https://api.example.org RESPONSEGRID_EMERGENCY_SLUG=my-event-2026",
    );
    process.exit(1);
  }
}
if (env.ENABLE_PATIENT_OCR) {
  const missing = [
    !env.MINIMAX_API_KEY && "MINIMAX_API_KEY",
    !env.MINIMAX_OCR_BASE_URL && "MINIMAX_OCR_BASE_URL",
  ].filter(Boolean);
  if (missing.length) {
    console.error(
      `❌ ENABLE_PATIENT_OCR=true requiere: ${missing.join(", ")}. ` +
        "Ejemplo: MINIMAX_OCR_BASE_URL=https://api.example.org/v1",
    );
    process.exit(1);
  }
}

export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
