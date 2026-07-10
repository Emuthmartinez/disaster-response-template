---
name: disaster-content-audit
description: Gate de scrub bloqueante antes de cualquier push publico. Corre scripts/content-audit/run.sh, revisa los hits a mano, confirma que el historial de git esta limpio de objetos de un repo previo, y que ningun binario lleva EXIF/GPS. Nunca declara el arbol "limpio/seguro" -- su veredicto maximo es "sin hallazgos de patron conocido; no se puede confirmar que este limpio", y siempre exige revision humana antes de publicar.
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
   `disaster-deploy-vps`. Ese fork ahora tiene identidad real, `.env` local
   (que no debería estar trackeado, pero confírmalo), y potencialmente datos
   reales de prueba — nada de eso lo audita el mantenedor de este template
   por ellos.

## Hard stop

No se declara este gate "pasado" — y no se autoriza ningún `git push` a un
remoto público — si:
- `scripts/content-audit/run.sh` no existe todavía en este checkout.
- El script corrió pero no revisaste los hits a mano (punto 2).
- Hay algún binario de foto real en el árbol, con o sin GPS.
- El historial de git tiene commits/objetos de un repo anterior al de este
  template.
- Un humano no ha revisado el diff/árbol todavía.

En cualquiera de estos casos, el siguiente paso es "arreglar eso primero",
no "publicar de todos modos".
