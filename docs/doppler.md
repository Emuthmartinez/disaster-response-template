# Doppler (Camino A)

El Camino A usa [Doppler](https://doppler.com) como fuente única de verdad
para secretos — no hay `.env`/`.prod.env` en producción. Este documento cubre
cómo enlazar el CLI, la estructura de proyecto/configs, tokens de servicio
para CI, y la trampa más costosa: Doppler **no** empuja secretos a Cloudflare
Workers por sí solo.

## 1. Autenticar sin pisar otro workplace

Si ya usas Doppler para otra cosa en la misma máquina (otro cliente, otro
proyecto personal), `doppler login` por defecto guarda el token con scope
`/` — y **pisa** el token de ese otro workplace. Con `--scope` los dos
conviven: el token de este proyecto solo aplica dentro de su carpeta, y fuera
de ella se sigue usando el que ya tenías.

```bash
doppler login --scope ~/ruta/a/tu-repo
```

En el navegador, elige el workplace correcto para este despliegue.

Comprobar que no rompiste el otro workplace:

```bash
cd ~/ruta/a/tu-repo && doppler me   # debe decir el workplace de ESTE proyecto
cd ~ && doppler me                  # debe seguir diciendo el que ya tenías
```

## 2. Crear el proyecto y sus configs

```bash
cd ~/ruta/a/tu-repo
doppler projects create <tu-proyecto-doppler> \
  --description "Identidad + infra de tu despliegue"
```

Doppler crea `dev` / `stg` / `prd` automáticamente. Este template usa dos de
esos tres: `stg` para staging, `prd` para producción — enlaza el directorio
al que vayas a usar primero:

```bash
doppler setup --project <tu-proyecto-doppler> --config prd
```

Esto escribe la asociación en `~/.doppler`, **no** en el repo.

## 3. Guardar secretos — nunca en el historial del shell

Modo interactivo: pide el valor y no lo deja en el historial.

```bash
doppler secrets set JWT_SECRET
```

Alternativa desde el portapapeles:

```bash
pbpaste | doppler secrets set CLOUDFLARE_API_TOKEN
```

> No uses `doppler secrets set NOMBRE 'valor'` con el valor como argumento —
> esa forma queda en el historial del shell (`~/.zsh_history`,
> `~/.bash_history`) en texto plano.

Comprobar:

```bash
doppler secrets --only-names
```

## 4. Los NOMBRES de variable son el contrato — `.env.example` los define

Doppler no tiene su propio esquema de qué variables hacen falta. El contrato
completo (qué variable, `[REQ]` u `[OPT]`, con qué formato) vive en
`.env.example`, en la raíz del repo — úsalo como checklist al poblar `stg` y
`prd`. Los mismos NOMBRES aplican sin importar si el valor termina en un
`.env` (Camino B) o en Doppler (Camino A).

## 5. LA TRAMPA: Doppler no sincroniza solo con los Workers

Guardar un secreto en Doppler **no lo mueve a Cloudflare**. Un Worker no lee
Doppler en runtime — lee sus propios *secrets* de Cloudflare, que son un
almacén separado. Cada vez que cambies un secreto en Doppler, hace falta un
paso explícito para empujarlo:

```bash
# Todos los secretos de prd al Worker de producción, de una vez:
doppler secrets download --project <tu-proyecto-doppler> --config prd \
  --no-file --format env | wrangler secret bulk --env production

# Uno solo, interactivo:
doppler run --project <tu-proyecto-doppler> --config prd -- \
  wrangler secret put NOMBRE_DEL_SECRETO
```

Repite para staging (`--config stg`, `--env staging`) y para cada Worker
(frontend/backend/admin) que necesite ese secreto — no es un paso que se
hace una vez y queda, es un paso que se repite cada vez que cambia un valor.

Después de empujar un secreto nuevo, cuenta **30–60 segundos** de
propagación a los isolates de Cloudflare que ya estaban calientes antes de
confiar en que un script de verificación vea el valor nuevo — un chequeo
inmediato después del push puede leer legítimamente el estado viejo durante
esa ventana.

## 6. Tokens de servicio para CI

GitHub Actions no debe tener tus credenciales de Doppler completas — usa un
token de servicio, de solo lectura, acotado a un config:

```bash
doppler configs tokens create github-actions \
  --project <tu-proyecto-doppler> --config prd --plain
```

Guarda la salida como secret de GitHub (uno por config que tu CI necesite
leer, típicamente `DOPPLER_TOKEN` para prod y `DOPPLER_TOKEN_STAGING` para
staging):

```bash
gh secret set DOPPLER_TOKEN --repo <tu-org>/<tu-repo>
gh secret set DOPPLER_TOKEN_STAGING --repo <tu-org>/<tu-repo>
```

En el workflow: `doppler run --token "$DOPPLER_TOKEN" -- <comando>`. Estos
dos son, en principio, los **únicos** secretos que GitHub Actions necesita
conocer directamente — todo lo demás (tokens de Cloudflare, claves de
Turnstile, credenciales de R2, etc.) lo inyecta `doppler run` en cada paso
del workflow, nunca vive como un secret de GitHub por separado.

## 7. Aplicar el módulo de OpenTofu con el token de Doppler

El provider de Cloudflare lee `CLOUDFLARE_API_TOKEN` del entorno, así que
`doppler run` se lo entrega sin que el token toque disco ni
`terraform.tfvars`:

```bash
cd infra/cloudflare
doppler run --project <tu-proyecto-doppler> --config prd -- tofu init
doppler run --project <tu-proyecto-doppler> --config prd -- tofu plan
doppler run --project <tu-proyecto-doppler> --config prd -- tofu apply
```

Ver `docs/cloudflare-tokens.md` para qué permisos exactos necesita ese
token.
