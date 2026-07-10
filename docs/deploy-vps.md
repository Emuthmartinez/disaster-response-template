# Desplegar en un VPS

Runbook humano para el mismo camino que automatiza la skill
`.claude/skills/disaster-deploy-vps/SKILL.md`. Si tienes un agente
disponible, pídele que corra esa skill directamente — este documento es para
cuando quieres hacerlo a mano, revisar cada paso antes de que un agente lo
ejecute, o depurar un despliegue que ya existe.

Este runbook es **genérico para cualquier proveedor de VPS** (Hetzner,
DigitalOcean, Linode, OVH, Vultr, un servidor físico propio, lo que sea) —
todo lo que sigue asume solo acceso SSH root/sudo a una máquina Ubuntu
22.04/24.04 recién provista, nada específico de un proveedor.

## Prerequisitos (verifica antes de tocar el VPS)

Estos tres pasos deben haber corrido ya, en este orden, sobre tu propio fork
(no sobre esta plantilla genérica):

1. **`disaster-configure`** — `config/deployment.config.json` ya no tiene
   valores de `"Ejemplo"`/`example.org`.
   ```bash
   grep -in "ejemplo\|example.org" config/deployment.config.json
   ```
   Debe devolver vacío.
2. **`disaster-brand`** — `docs/DESIGN.md` y `frontend/app/globals.css` ya
   tienen tu paleta real, no la de ejemplo.
3. **`disaster-secrets-bootstrap`** — ya existe un `.env`/`.prod.env`
   completo, sin `CHANGE_ME` ni valores de ejemplo:
   ```bash
   grep -in "change_me\|example.org\|example_" .prod.env
   ```
   Debe devolver vacío. Si `.prod.env` todavía no existe, corre esa skill
   ahora — no generes secretos ad-hoc en este paso.

Si alguno de los tres falla, resuélvelo antes de seguir.

## Qué necesitas

- Acceso SSH root (o sudo) a un VPS Ubuntu 22.04/24.04 recién provisto, de
  cualquier proveedor.
- Los tres dominios ya elegidos en `deployment.config.json`
  (`domains.web`, `domains.api`, `domains.admin`) y acceso al panel DNS de
  quien los administre, para crear los registros A.
- El repositorio a clonar es **tu fork** (con tu identidad y tus secretos),
  no este template genérico.

## 1. Provisión y hardening del VPS

```bash
# Como root, en el VPS recién provisto:
adduser deploy
usermod -aG sudo,docker deploy
# Copia tu clave SSH pública a /home/deploy/.ssh/authorized_keys ANTES de
# deshabilitar el login de root/password — si te equivocas de orden te
# quedas fuera del servidor.

# Hardening de SSH (/etc/ssh/sshd_config):
#   PermitRootLogin no
#   PasswordAuthentication no
systemctl reload sshd

# Firewall: solo SSH, HTTP, HTTPS.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# fail2ban contra fuerza bruta SSH.
apt-get update && apt-get install -y fail2ban
systemctl enable --now fail2ban
```

## 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

## 3. Clonar tu fork

```bash
su - deploy
git clone <url-de-tu-fork> app
cd app
```

Copia tu `.prod.env` (generado por `disaster-secrets-bootstrap`) al VPS por
un canal seguro — nunca lo subas a git para llegar aquí, y nunca lo pegues en
un chat:

```bash
scp .prod.env deploy@<ip-del-vps>:~/app/.prod.env
```

## 4. DNS — antes de levantar Caddy

En el proveedor DNS que gestione tus dominios (puede ser un proveedor
distinto al del VPS), crea un registro A por dominio, apuntando a la IP
pública del VPS:

```text
<domains.web>    A    <ip-del-vps>
<domains.api>    A    <ip-del-vps>
<domains.admin>  A    <ip-del-vps>
```

Espera propagación antes de continuar:

```bash
dig +short <domains.web>
```

Debe devolver la IP del VPS. Caddy pide certificados Let's Encrypt vía
HTTP-01/ALPN en el siguiente paso, y falla si el dominio todavía no resuelve
hacia el VPS.

## 5. Levantar el stack

```bash
docker compose -f docker-compose.prod.yml --env-file .prod.env up -d --build
docker compose -f docker-compose.prod.yml --env-file .prod.env logs -f
```

El servicio `caddy` publica `80:80`/`443:443` directo en el host (perfil "un
solo box": sin ningún proxy/edge externo delante) — el `ufw allow 80/tcp` /
`443/tcp` del paso 1 es lo único que necesita el tráfico público para llegar
hasta él.

El servicio `migrate` corre las migraciones de base de datos y debe terminar
con éxito antes de que `backend`/`worker` arranquen — es una dependencia
declarada en el compose (`condition: service_completed_successfully`), no
necesitas orquestarla a mano.

## Smoke checks (obligatorios antes de anunciar el despliegue)

1. **Todos los servicios sanos:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .prod.env ps
   ```
   `db` y `valkey` deben mostrar `healthy`; `backend`, `worker`, `frontend`,
   `admin`, `caddy` deben mostrar `running` (no `restarting` en loop — si lo
   ves, revisa los logs de ese servicio específico).
2. **TLS emitido y sitio responde:**
   ```bash
   curl -sI https://<domains.web> | head -1
   curl -sI https://<domains.api>/api/healthz | head -1
   curl -sI https://<domains.admin> | head -1
   ```
   Todos deben devolver `200`/`30x`, no error de certificado ni timeout.
3. **El mapa carga y centra en tu región** — abre `https://<domains.web>` y
   confirma visualmente que no muestra la coordenada de ejemplo.
4. **Un reporte de prueba funciona de punta a punta** — envía un reporte
   con datos obviamente ficticios (nunca una persona real) desde el sitio
   público y confirma que aparece en el mapa/lista. Esto ejercita Turnstile
   (si está configurada), rate-limit, la ruta pública del backend, Postgres
   y el render del frontend en un solo flujo.
5. **El panel admin autentica** con el superadmin sembrado
   (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` de tu `.prod.env`).
6. **Logs sin errores recurrentes:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .prod.env logs --tail=200 backend worker | grep -i "error\|fatal"
   ```
   Un error puntual de arranque puede ser normal; un loop de crash no.

## Backups

Esta plantilla no trae un job de backup automatizado — es una decisión tuya
qué política de retención y qué destino usar (ver `SECURITY.md`), pero el
mecanismo es simple porque todo el estado con estado vive en dos volúmenes
Docker:

- **`pg_data`** — Postgres completo (reportes, personas, hospitales, RBAC).
- **`valkey_data`** — colas BullMQ y cache; recreable, normalmente no
  necesitas respaldarlo (perder la cola en curso no pierde datos de negocio,
  solo reintentos en vuelo).

Backup lógico de Postgres (recomendado, portable entre versiones y fácil de
restaurar parcialmente):

```bash
docker compose -f docker-compose.prod.yml --env-file .prod.env exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```

Automatízalo con un cron en el VPS (fuera del compose, para que sobreviva un
`down`/`up` del stack) y sube el resultado a un destino fuera del VPS —
object storage S3-compatible (el mismo proveedor R2 que ya podrías estar
usando para fotos, u otro), o cualquier destino que controles. Un backup que
vive solo en el mismo disco que la base de datos no protege contra la
pérdida del VPS completo.

Para restaurar:

```bash
gunzip -c backup-2026-07-10.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .prod.env exec -T db \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

Prueba tu restore al menos una vez antes de necesitarlo de verdad —un backup
nunca probado es una suposición, no una garantía.

## Actualizar un despliegue existente

```bash
cd app
git pull origin main   # o la rama que uses para producción
docker compose -f docker-compose.prod.yml --env-file .prod.env up -d --build
```

- El servicio `migrate` vuelve a correr en cada `up --build` y aplica
  cualquier migración nueva antes de que `backend`/`worker` arranquen —no
  necesitas correr migraciones a mano.
- Las migraciones de este proyecto deben ser expand-contract (ver
  `docs/architecture.md`) precisamente para que este `up` sin downtime
  funcione: el contenedor viejo sigue sirviendo tráfico mientras el nuevo
  arranca contra el esquema ya migrado.
- Si cambiaste variables `NEXT_PUBLIC_*` en `.prod.env`, no basta con
  reiniciar — esas variables se inlinean en build time, así que el rebuild
  de `frontend` de arriba ya las toma; confírmalo si dudas:
  ```bash
  docker compose -f docker-compose.prod.yml --env-file .prod.env build --no-cache frontend
  ```
- Revisa los smoke checks de arriba después de cada actualización, no solo
  en el primer despliegue.

## Rollback

Si algo falla después de `up -d` y necesitas volver al estado anterior:

```bash
# Detén el stack nuevo SIN borrar volúmenes (conserva los datos):
docker compose -f docker-compose.prod.yml --env-file .prod.env down

# Vuelve al commit/tag anterior:
git checkout <commit-o-tag-anterior>

# Reconstruye y levanta esa versión:
docker compose -f docker-compose.prod.yml --env-file .prod.env up -d --build
```

Los volúmenes (`pg_data`, `valkey_data`, `caddy_data`, `caddy_config`) NO se
tocan por un `down` normal (sin `-v`) — los datos sobreviven al rollback. Si
el rollback es por una migración de esquema rota, revisa primero si la
migración nueva era expand-contract antes de intentar revertir el esquema —
revertir código con un esquema ya migrado hacia adelante puede romper más de
lo que arregla.

**Nunca** uses `down -v` (borra volúmenes, incluida la base de datos) como
parte de un rollback de rutina — es destructivo e irreversible. Solo con
autorización explícita de quien opera el despliegue para descartar datos.

## Siguiente paso

Antes de que tu fork se haga público o se comparta ampliamente, corre
`disaster-content-audit` sobre el árbol completo (ver
[`SECURITY.md`](../SECURITY.md)) — el despliegue en VPS no reemplaza esa
revisión.
