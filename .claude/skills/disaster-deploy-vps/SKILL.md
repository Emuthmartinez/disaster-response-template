---
name: disaster-deploy-vps
description: Levanta la plantilla end-to-end en un VPS Ubuntu limpio -- usuario de deploy + hardening SSH, UFW, fail2ban, Docker, clona el repo del deployer, corre disaster-secrets-bootstrap si falta, docker compose -f docker-compose.prod.yml up -d, TLS con Caddy sobre los dominios reales (con el paso de DNS), y smoke checks. Requiere que disaster-configure, disaster-brand y disaster-secrets-bootstrap ya hayan corrido.
---

# disaster-deploy-vps

Último paso técnico del standup, antes de `disaster-content-audit`. Deja el
sitio corriendo en un único VPS con `docker-compose.prod.yml` + Caddy, según
lo documentado en `docs/architecture.md` (sección "Despliegue") y la cabecera
de `docker-compose.prod.yml`.

## Prerequisitos (gate — verifica antes de tocar el VPS)

1. `config/deployment.config.json` sin valores de `example.org`/"Ejemplo"
   (`disaster-configure` corrió).
2. `docs/DESIGN.md` / `frontend/app/globals.css` con la paleta real, no la de
   ejemplo (`disaster-brand` corrió).
3. `.env`/`.prod.env` existe, sin `CHANGE_ME`/`example.org`, con todo `[REQ]`
   presente (`disaster-secrets-bootstrap` corrió). Si no existe, córrelo
   ahora mismo antes de continuar — no generes secretos ad-hoc aquí.
4. **`TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY` están
   configuradas, O el deployer ya dio autorización explícita por escrito
   para ir a producción sin anti-bot** (ver hard stop de
   `disaster-secrets-bootstrap`). No lo des por hecho tú mismo — si no ves
   esa autorización en la conversación, pregúntale directamente antes de
   seguir.

Si cualquiera de los cuatro falla, detente y corre (o resuelve) el paso que
falte primero.

## Qué necesitas del deployer

- Acceso SSH root (o sudo) a un VPS Ubuntu recién provisto (22.04/24.04).
  **Autorización explícita de acceso/credenciales es responsabilidad del
  deployer** — no asumas que puedes generar o rotar claves SSH sin que te lo
  pidan.
- Los tres dominios ya elegidos en `deployment.config.json` (`domains.web`,
  `domains.api`, `domains.admin`) con acceso al panel DNS para crear los
  registros A.
- Confirmación de que el repo que vas a clonar es el FORK del deployer (no
  este template genérico) — el deploy usa la identidad/secretos de ese fork.

## Pasos

### 1. Provisión y hardening del VPS

```bash
# Como root, en el VPS recién provisto:
adduser deploy
usermod -aG sudo,docker deploy
# Copia la clave SSH pública del deployer a /home/deploy/.ssh/authorized_keys
# antes de deshabilitar el login de root/password.

# SSH hardening (/etc/ssh/sshd_config):
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

### 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

### 3. Clonar el repo del deployer

```bash
su - deploy
git clone <url-del-fork-del-deployer> app
cd app
```

Copia `.env`/`.prod.env` (generado por `disaster-secrets-bootstrap`) al VPS
por un canal seguro (`scp`, no pegado en un chat) — **nunca** lo subas a git
para llegar aquí.

```bash
scp .prod.env deploy@<vps-ip>:~/app/.prod.env
```

### 4. DNS — antes de levantar Caddy

Crea, en el proveedor DNS del deployer, un registro A por cada dominio
apuntando a la IP pública del VPS:

```text
<domains.web>    A    <ip-del-vps>
<domains.api>    A    <ip-del-vps>
<domains.admin>  A    <ip-del-vps>
```

Espera propagación (`dig +short <domains.web>` debe devolver la IP del VPS)
antes del paso siguiente — Caddy pide certificados Let's Encrypt vía
HTTP-01/ALPN y falla si el dominio no resuelve todavía al VPS.

### 5. Levantar el stack

```bash
docker compose -f docker-compose.prod.yml --env-file .prod.env up -d --build
docker compose -f docker-compose.prod.yml --env-file .prod.env logs -f
```

El servicio `caddy` publica `80:80`/`443:443` directo en el host (perfil "un
solo box": sin ningún proxy/edge externo delante) — el `ufw allow 80/tcp` /
`443/tcp` del paso 1 es lo único que necesita el tráfico público para
llegar hasta él. No hace falta crear ninguna red Docker externa.

El servicio `migrate` corre las migraciones y debe completar
(`service_completed_successfully`) antes de que `backend`/`worker` arranquen
— es una dependencia declarada en el compose, no necesitas orquestarla a
mano.

## Smoke checks (obligatorios antes de anunciar el despliegue)

1. **Todos los servicios healthy/running:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .prod.env ps
   ```
   `db` y `valkey` deben mostrar `healthy`; `backend`, `worker`, `frontend`,
   `admin`, `caddy` deben mostrar `running` (no `restarting` en loop — si lo
   ves, revisa logs de ese servicio específico).
2. **TLS emitido y sitio responde:**
   ```bash
   curl -sI https://<domains.web> | head -1
   curl -sI https://<domains.api>/api/health 2>/dev/null | head -1 || curl -sI https://<domains.api> | head -1
   curl -sI https://<domains.admin> | head -1
   ```
   Todos deben devolver `200`/`30x`, no error de certificado ni timeout.
3. **El mapa carga y centra en la región** — abre `https://<domains.web>` en
   un navegador (o `curl` + inspección del HTML si no hay browser a mano) y
   confirma visualmente que el mapa no muestra la coordenada de ejemplo.
4. **Reporte funciona end-to-end** — desde el sitio público, envía un
   reporte de prueba (usa datos obviamente ficticios, nunca una persona
   real) por el flujo normal de la UI y confirma que aparece en el mapa/lista
   tras el submit. Esto ejercita: Turnstile, rate-limit, la ruta pública del
   backend, Postgres y el render del frontend en un solo flujo. **Verifica
   explícitamente que el widget de Turnstile aparece y bloquea el submit sin
   resolverlo** — no basta con que el reporte llegue, confirma que el
   anti-bot está realmente activo. Si no aparece porque
   `TURNSTILE_SECRET_KEY` quedó vacía sin la autorización explícita del
   prerequisito 4 de arriba, NO declares el despliegue listo: vuelve a
   `disaster-secrets-bootstrap` o consigue esa autorización antes de seguir.
5. **Panel admin autentica:** entra a `https://<domains.admin>` con el
   superadmin sembrado (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` de
   `.prod.env`) y confirma login exitoso.
6. **Logs sin errores repetidos:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .prod.env logs --tail=200 backend worker | grep -i "error\|fatal"
   ```
   Investiga cualquier error recurrente antes de dar el despliegue por
   bueno (un error puntual de arranque puede ser normal; un loop de crash
   no).

## Rollback

Si algo falla después de `up -d` y necesitas volver al estado anterior:

```bash
# Detener el stack nuevo sin borrar volúmenes (conserva datos):
docker compose -f docker-compose.prod.yml --env-file .prod.env down

# Volver al commit/tag anterior del repo:
git checkout <commit-o-tag-anterior>

# Reconstruir y levantar esa versión:
docker compose -f docker-compose.prod.yml --env-file .prod.env up -d --build
```

Los volúmenes (`pg_data`, `valkey_data`, `caddy_data`, `caddy_config`) NO se
tocan por un `down` normal (sin `-v`) — los datos sobreviven al rollback. Si
el rollback es por una migración de esquema rota, revisa primero si la
migración nueva era expand-contract (ver `docs/architecture.md`) antes de
intentar revertir el esquema — revertir código con un esquema ya migrado
hacia adelante puede romper más que arreglar.

**Nunca** uses `down -v` (borra volúmenes, incluida la base de datos) como
parte de un rollback de rutina — eso es destructivo e irreversible. Solo con
autorización explícita del deployer para descartar datos.

## Hard stop

No anuncies el despliegue como listo si:
- Cualquier prerequisito (`disaster-configure`/`disaster-brand`/
  `disaster-secrets-bootstrap`) no corrió.
- Algún smoke check de arriba falla.
- El DNS todavía no propagó y Caddy no logró emitir certificados TLS.

## Siguiente paso

Antes de que el fork del deployer se haga público o se comparta ampliamente,
corre `disaster-content-audit` sobre el árbol completo — el despliegue en
VPS no reemplaza esa revisión.
