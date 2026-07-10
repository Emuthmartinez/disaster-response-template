# CLAUDE.md — entrypoint para agentes

Esta es una **plantilla pública** para levantar un sitio de respuesta a
desastres: mapa/lista de reportes ciudadanos, directorio de
hospitales/refugios, centros de acopio, panel admin con RBAC y un worker de
sincronización. Frontend Next.js, backend Express/Drizzle/Postgres, worker
BullMQ, admin Next.js standalone, todo detrás de Caddy en un único VPS
(`docker-compose.prod.yml`). No asume ningún país, evento ni organización —
toda esa identidad vive en `config/deployment.config.json` y en `.env`.

Para las convenciones de código (endpoints, DDD de integraciones, Drizzle,
reglas ESLint) lee **`AGENTS.md`**. Este archivo cubre solo el *standup* de un
despliegue nuevo: qué skill correr, en qué orden, y qué nunca hacer.

## Orden de standup (obligatorio, en este orden)

Cinco `.claude/skills/disaster-*` cubren el ciclo completo de poner en
producción un fork de este template. Cada uno tiene su propio `SKILL.md` con
pasos, verificación y hard-stops — este archivo solo da el mapa.

1. **`disaster-configure`** — rellena `config/deployment.config.json` (org,
   producto, desastre, región, centro del mapa, idioma, contacto, dominios) y
   propaga esos valores a `manifest.webmanifest`, `event-data.ts` y
   `emergency-contacts.ts` (números reales de emergencia — te los da el
   deployer, no se inventan).
2. **`disaster-brand`** — aplica colores/logo reales a `docs/DESIGN.md`, las
   variables CSS, el manifest, los SVG de icon/hero y las imágenes OG.
   Rehúsa correr si el paso 1 no terminó.
3. **`disaster-secrets-bootstrap`** — genera secretos fuertes
   (`openssl rand`) para cada variable `[REQ]` de `.env.example` y escribe
   `.env`/`.prod.env` (nunca se commitea). Opcionalmente sube secretos a
   GitHub Environments.
4. **`disaster-deploy-vps`** — provisión de un VPS Ubuntu limpio, hardening,
   Docker, clona el fork del deployer, `docker compose -f
   docker-compose.prod.yml up -d`, TLS con Caddy sobre los dominios reales
   (con el paso de DNS), y smoke checks. Requiere que 1–3 ya hayan corrido.
5. **`disaster-content-audit`** — gate bloqueante **antes de cualquier fork
   o push público**: corre `scripts/content-audit/run.sh`, revisión humana
   del diff/árbol, historial de git limpio, sin EXIF/GPS en binarios. Se
   vuelve a correr cada vez que el repo esté a punto de hacerse público —
   incluido cada fork de un deployer sobre su propia copia.

Guía humana equivalente, con quickstart de 30 minutos: `docs/standup-guide.md`.

## Reglas de seguridad (sin excepción)

- **Nunca commitees `.env`** ni ningún `.env.*` real (`.gitignore` ya los
  cubre; `.env.example` es el único que sí se commitea, y solo con
  placeholders obviamente falsos como `CHANGE_ME_...`/`example.org`).
- **Nunca commitees datos reales de una crisis.** Ni en código, ni en
  fixtures, ni en tests, ni en docs, ni en un issue o PR. Nombres de
  personas, cédulas, teléfonos, direcciones privadas, notas médicas o fotos
  reales de afectados no van a este repo bajo ninguna circunstancia — este
  no es el canal para eso. Ver `AGENTS.md` sección "Seguridad y privacidad"
  para la lista completa de qué nunca se hardcodea.
- **Política de no-datos-reales en seeds/fixtures.** `backend/src/seed/`
  genera datos SINTÉTICOS con prefijo `DEMO-`, aborta si `NODE_ENV=production`
  o si `DATABASE_URL` no apunta a un host local, y aborta si ya hay filas
  no-demo en la tabla (anti-mezcla). Cualquier fixture o test nuevo sigue el
  mismo patrón: sintético, marcado como demo, nunca un dato real "de
  ejemplo" copiado de un caso real.
- **No inventes ni asumas identidad real.** Cualquier dominio, email,
  teléfono, nombre de organización/evento o coordenada sensible que aparezca
  en código fuera de `config/deployment.config.json`/`.env` es un bug —
  repórtalo o corrígelo, no lo repliques.
- **El historial de git debe quedarse vacío** hasta que
  `disaster-content-audit` dé su verdicto y un humano revise el árbol. No
  hagas `git commit`/`git push` en este template por iniciativa propia
  mientras trabajas en él — eso es una decisión del mantenedor humano, no de
  un agente.

## Dónde mirar

```text
config/deployment.config.json   Identidad del despliegue (fuente de verdad)
.env.example                     Contrato completo de variables de entorno
.claude/skills/disaster-*/       Los cinco skills de standup (ver arriba)
docs/standup-guide.md            Guía humana equivalente + quickstart 30 min
docs/architecture.md             Estado actual del sistema (actualízalo si
                                  cambias arquitectura real)
docs/DESIGN.md                   Sistema de diseño / tokens de marca
AGENTS.md                        Convenciones de código para agentes/humanos
CONTRIBUTING.md                  Flujo de contribución, fork-first
```

Si algo en este archivo entra en conflicto con `AGENTS.md` para una tarea de
código (no de standup), gana `AGENTS.md` — este archivo es específicamente
la puerta de entrada al proceso de desplegar un fork nuevo.
