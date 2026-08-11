---
name: disaster-content-audit
description: Gate de scrub bloqueante antes de cualquier push publico. Corre scripts/content-audit/run.sh, revisa los hits a mano, confirma que el historial de git esta limpio de objetos de un repo previo, y que ningun binario lleva EXIF/GPS. Cubre el switch template/deployment de scripts/content-audit/mode, los overlays privados gitignored (banned-patterns.local.txt, asset-allow.local.txt), y el marcador de un solo uso del chequeo de historial de git. Nunca declara el arbol "limpio/seguro" -- su veredicto maximo es "sin hallazgos de patron conocido; no se puede confirmar que este limpio", y siempre exige revision humana antes de publicar.
---

# disaster-content-audit

Último paso antes de que este árbol (o el fork de un deployer) se haga
público, se convierta en un repo de GitHub visible, o se comparta fuera del
círculo de quien lo está preparando. Es un **gate**, no un trámite: si algo
de lo de abajo falla o queda ambiguo, el push no ocurre todavía.

## Por qué existe

Este template maneja, en despliegues reales, datos de personas en una crisis
humanitaria. Un `git push` a un repo público expone TODO el historial, no
solo el estado final del árbol — un secreto o un dato personal borrado en un
commit posterior sigue siendo recuperable por cualquiera con `git log -p` o
`git cat-file`. Este skill existe porque "el código de hoy se ve limpio" y
"este repo es seguro de publicar" son afirmaciones distintas, y solo la
segunda importa.

## Entrypoint

Todo el escaneo automatizado vive en:

```bash
scripts/content-audit/run.sh
```

Ese script (mantenido por quien sea dueño de la superficie de escaneo, fuera
del alcance de este skill) es el punto de entrada — corre el detector de
secretos/PII y produce un reporte. Si el script todavía no existe en este
checkout, **detente**: no improvises un escaneo ad-hoc en su lugar, señala
que falta y no continúes con el resto de este skill hasta que exista.

```bash
bash scripts/content-audit/run.sh
```

Revisa el código de salida y el reporte que produce (el `.gitignore` de este
repo ya reserva los patrones `noseyparker-report*` y `gitleaks-report*` para
sus salidas — si el script usa otro nombre, ese archivo también debe quedar
gitignored antes de que exista, para no commitear el propio reporte de
hallazgos).

## Modo: `template` vs `deployment`

`scripts/content-audit/mode` (un archivo de texto plano, trackeado por git)
controla qué tan estricto es el escaneo de assets binarios. Un checkout
recién clonado del template público NO trae este archivo con valor
`deployment` — por defecto (archivo ausente, o con cualquier valor que no
sea exactamente `template`/`deployment`) el script cae al modo `template`,
el más estricto, con un aviso a stderr si el valor era inválido.

- **`template`** (default) — ninguna extensión raster (`.jpg`/`.png`/etc.)
  se permite en ningún directorio, ni siquiera dentro del allowlist de SVG.
  `asset-allow.local.txt` se IGNORA aunque exista (con un aviso a stderr) —
  un fork que todavía no decidió pasar a modo despliegue no hereda por
  accidente un allowlist que dejó otro fork.
- **`deployment`** — cualquier prefijo del allowlist de assets (el
  incorporado, `frontend/public/`/`frontend/app/`, más lo que agregue
  `asset-allow.local.txt`) permite TANTO binarios raster COMO SVG — un
  favicon.ico o un OG en PNG bajo `frontend/public/` es normal en un
  despliegue real con marca completa.

**Cuándo hacer el flip** (responsabilidad del deployer, típicamente después
de que `disaster-brand` haya commiteado los assets de marca reales):

```bash
printf 'deployment' > scripts/content-audit/mode
git add scripts/content-audit/mode && git commit -m "content-audit: pasar a modo deployment"
```

Si el kit de marca del deployer necesita un directorio propio fuera de
`frontend/public/`/`frontend/app/` (p.ej. un `brand/` en la raíz), agrega
ese prefijo a `scripts/content-audit/asset-allow.local.txt` (un path por
línea, p.ej. `./brand/`) — ese archivo es gitignored y solo se lee en modo
`deployment`; no lo agregues al PUBLIC `banned-patterns.txt`/`run.sh`.

## Overlays privados (gitignored, nunca se publican)

Dos archivos opcionales, uno por cada tipo de dato que el escaneo público no
puede contener (ver la cabecera de `banned-patterns.txt`: el archivo público
solo lleva FORMAS de patrón genéricas, nunca un literal real de un
despliegue concreto):

- **`scripts/content-audit/banned-patterns.local.txt`** — literales reales
  del despliegue que quieres seguir baneando activamente (dominios/IDs de un
  despliegue ANTERIOR del que este fork desciende, por ejemplo). Misma
  sintaxis `plain`/`CONTEXT:`/`CASESENSITIVE:` que el archivo público, y se
  carga en AMBOS modos (no solo `deployment`).
- **`scripts/content-audit/asset-allow.local.txt`** — prefijos de path
  extra para el allowlist de assets binarios, solo honrado en modo
  `deployment` (ver arriba).

Ninguno de los dos existe en un checkout nuevo del template — créalos tú
mismo si tu fork los necesita, nunca los propongas para el `banned-patterns.txt`
público (eso filtraría la identidad de un despliegue real a cualquiera que
lea el template).

## Alcance del allowlist de `CONTEXT:` (palabras de origen del template)

Los patrones `CONTEXT:` de `banned-patterns.txt` (p.ej. el nombre/linaje de
un despliegue anterior del que este template desciende) están permitidos
SOLO en: cualquier `*.md` en la RAÍZ del repo (README, CONTRIBUTING,
SECURITY, AGENTS, CLAUDE — no en un `*.md` anidado como
`admin/README.md`/`frontend/AGENTS.md`, esos siguen baneados) y en TODO el
árbol de `docs/`. En cualquier otro sitio — `frontend/`, `backend/`,
`admin/`, `infra/`, `config/`, o un `.md` anidado — el ban se mantiene
firme, porque ahí es donde un literal copiado de verdad rompería o filtraría
algo. (Nota: si ves un comentario en `banned-patterns.txt` que describe un
allowlist más angosto de solo 3 archivos fijos, ese comentario está
desactualizado respecto al `is_allowlisted()` real de `run.sh` — confía en
el código, no en ese comentario; repórtalo si lo ves, es una deriva
documentación-vs-código dentro del propio script de audit.)

## GA / Discord: cuándo un "leak" pasa a ser "nuestro propio identificador"

`banned-patterns.txt` banea de forma dura la forma de un ID de medición de
Google Analytics y la de un link de invitación de Discord (el dominio corto
de invitaciones, escrito aquí como `discord[.]gg` para no disparar el propio
patrón). Un fork recién clonado del
template sigue siendo genérico — ambos bans se quedan activos ahí, sin
excepción. Pero una vez que un despliegue va en vivo con SU PROPIA cuenta de
GA/Discord, ese identificador deja de ser "un secreto filtrado" y pasa a ser
"nuestra propia identidad pública", igual que un dominio real deja de ser un
leak en cuanto el deployer lo posee. El procedimiento sancionado (documentado
inline en `banned-patterns.txt`, encima de ambos patrones) es: **nunca
borres el patrón del archivo público** — coméntalo en TU PROPIO fork, con
una nota fechada explicando por qué, para que el retiro quede visible en
`git diff`/`git blame` en vez de leerse como un debilitamiento silencioso
del scanner:

```
# RETIRED 2026-08-10: este es nuestro propio ID de GA (G-XXXXXXXXXX), no un
# leak — ver docs/architecture.md para la decisión de go-live.
# \bG-[A-Z0-9]{2,}[0-9][A-Z0-9]{2,}\b
```

## Semántica del chequeo de historial de git (marcador de un solo uso)

El chequeo de "el historial es pequeño y reciente" (sección 2c de `run.sh`)
NO corre en cada ejecución — corre exactamente UNA VEZ, condicionado a que
exista `scripts/content-audit/.content-audit-fresh` (un marcador sin
contenido significativo, solo su presencia importa). Por qué: un chequeo de
conteo de commits no tiene un umbral que funcione tanto "recién clonado el
template" como "dos meses de despliegue real" — el historial legítimo de un
despliegue en producción crece más allá de cualquier número fijo, así que un
chequeo que corriera siempre terminaría fallando en cada ejecución para
siempre y la gente dejaría de leer el reporte, justo cuando sí podría estar
detectando algo real.

- Con el marcador presente: falla si hay más de 50 commits en total, o si
  algún commit es anterior al `CUTOFF_DATE` fijado en `run.sh` (evidencia de
  que el historial de OTRO repo se coló en este checkout).
- Al terminar esa comprobación (pase o falle), `run.sh` borra el marcador
  del ÁRBOL DE TRABAJO — pero eso no tiene efecto hasta que un humano
  commitee esa eliminación (`git add -A && git commit`). Sin ese commit, el
  chequeo se repite en el próximo checkout limpio (incluido cualquier PR de
  CI que todavía no haya commiteado el borrado).
- Sin el marcador (ya borrado y commiteado, o un checkout que nunca lo
  tuvo): el chequeo se omite con un aviso a stderr, no un fallo — no es una
  regresión, es la señal de que ya corrió una vez.

Si ves este chequeo en rojo, el paso correcto no es subir el umbral de 50 a
mano en `run.sh` (eso es tocar el script público, fuera del alcance de este
skill) — es simplemente dejar que corra, revisar los commits que señala, y
si son legítimos, commitear el borrado del marcador como se explica arriba.

## Pasos

1. **Corre el entrypoint** y guarda su salida completa:
   ```bash
   bash scripts/content-audit/run.sh
   ```
2. **Revisa cada hit a mano.** No cierres el gate solo porque el script
   terminó con código 0 — un detector de patrones no entiende contexto:
   - Un `CHANGE_ME_...` o un dominio `example.org` en `.env.example` es
     esperado (placeholder documentado) — no es un hallazgo real.
   - Una URL, teléfono, email o handle real embebido en código, fixtures,
     tests o docs SÍ es un hallazgo real, incluso si el script no lo marcó
     como "secreto" (los detectores de secretos no suelen marcar PII o
     identidad de marca — lee `AGENTS.md` sección "Seguridad y privacidad"
     para la lista completa de qué no debe hardcodearse).
   - Cualquier coordenada, nombre o identificador que parezca de una persona
     real (no "Ciudad Ejemplo Uno", sino un nombre propio, una dirección
     completa, un documento de identidad) es un hallazgo crítico —
     detente y escala, no lo "arregles" borrándolo tú solo sin que quede
     registrado qué se encontró y por qué.
3. **Verifica que el historial de git no carga objetos de un repo anterior.**
   Este árbol pudo haber sido extraído/derivado de otro repo (con datos
   reales de un despliegue previo) — confirma que no arrastra ese historial:
   ```bash
   git log --all --oneline | head -50
   git rev-list --objects --all | wc -l
   ```
   Si esto es un fork limpio (`git status` muestra "No commits yet" o el
   primer commit es el commit inicial de este template), no debería haber
   nada que revisar. Si hay commits previos a la fecha de creación de este
   fork, o el conteo de objetos es sospechosamente alto para un checkout
   nuevo, investiga con `git log --diff-filter=D --summary` (archivos
   borrados que siguen en el historial) antes de continuar.
4. **Ningún binario lleva EXIF/GPS.** Fotos reales de reportes/daños pueden
   traer geolocalización embebida que expone la ubicación exacta de quien la
   tomó. Revisa cualquier imagen que vaya a entrar al repo (assets de marca,
   capturas de docs, fixtures de test):
   ```bash
   find . -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" \
     \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" -o -iname "*.tiff" \) \
     -exec sh -c 'exiftool -GPS:all -n "$1" 2>/dev/null | grep -q "GPS" && echo "GPS EXIF en: $1"' _ {} \;
   ```
   (requiere `exiftool`; si no está instalado, `sips -g all <archivo>` en
   macOS o `identify -verbose <archivo>` con ImageMagick son alternativas
   parciales — instala `exiftool` si vas a auditar fotos reales, es la
   herramienta correcta para esto). Este template no debería tener ningún
   binario de foto real versionado — si encuentras uno, es en sí mismo un
   hallazgo, independientemente de si trae GPS o no (ver reglas de "no
   binarios" del repo).
5. **Redacta el veredicto** usando exactamente el lenguaje de la sección
   siguiente — nunca "limpio" ni "seguro".

## Lenguaje del veredicto (obligatorio, no parafrasear a "limpio/seguro")

El resultado de este skill, sin importar cuántos hits hubo ni qué tan
prolijo quedó el árbol, se reporta siempre así:

> **Sin hallazgos de patrón conocido — no se puede confirmar que el árbol
> esté limpio.** Un escaneo automatizado busca patrones conocidos
> (secretos con forma reconocible, dominios/emails de ejemplo, EXIF GPS); no
> puede probar la ausencia de datos sensibles que no calcen con esos
> patrones (un nombre propio en prosa libre, una coordenada sin etiquetar,
> un secreto con un formato no reconocido). Un humano debe revisar el diff o
> el árbol completo antes de cualquier push público.

Nunca reemplaces esto por "el repo está limpio", "es seguro publicar" o
variantes — ese lenguaje afirma una garantía que ningún escaneo automatizado
puede dar.

## Antes de cualquier push público (instrucción explícita, siempre)

1. Un humano —no un agente— revisa el diff completo (`git diff` /
   `git show` del rango de commits, o el árbol completo si es la primera
   publicación) antes de que el repo se haga público o se le dé acceso a
   terceros.
2. Este mismo skill se vuelve a correr justo antes de flippear la
   visibilidad del repo a público (no basta con haberlo corrido una vez,
   días u horas antes — cualquier commit nuevo desde entonces no fue
   auditado).
3. **Cada deployer que haga fork de este template DEBE volver a correr este
   skill sobre SU PROPIO repo** antes de hacerlo público, después de
   `disaster-configure`/`disaster-brand`/`disaster-secrets-bootstrap`/
   `disaster-deploy-cloudflare`/`disaster-deploy-vps`. Ese fork ahora tiene
   identidad real, secretos reales (en `.env` local o en Doppler — ninguno
   debería estar trackeado en git, pero confírmalo), assets de marca reales
   (revisa si ya tiene sentido pasar `scripts/content-audit/mode` a
   `deployment` — ver esa sección arriba), y potencialmente datos reales de
   prueba — nada de eso lo audita el mantenedor de este template por ellos.

## Hard stop

No se declara este gate "pasado" — y no se autoriza ningún `git push` a un
remoto público — si:
- `scripts/content-audit/run.sh` no existe todavía en este checkout.
- El script corrió pero no revisaste los hits a mano (punto 2).
- Hay algún binario de foto real en el árbol, con o sin GPS.
- El historial de git tiene commits/objetos de un repo anterior al de este
  template.
- `scripts/content-audit/mode` quedó en un valor que no describe la
  realidad del fork (p.ej. sigue en `template` con assets de marca reales
  ya commiteados fuera del allowlist por defecto, o pasó a `deployment` sin
  que `disaster-brand` haya corrido todavía).
- El chequeo de historial de git falló (marcador `.content-audit-fresh`
  presente, más de 50 commits o un commit anterior al `CUTOFF_DATE`) y
  nadie investigó por qué antes de seguir.
- Un humano no ha revisado el diff/árbol todavía.

En cualquiera de estos casos, el siguiente paso es "arreglar eso primero",
no "publicar de todos modos".
