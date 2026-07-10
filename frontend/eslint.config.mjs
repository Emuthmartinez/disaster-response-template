import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Volcado vendado de un design system (no es código de la app).
    "Emergencia nacional de búsqueda/**",
    // Scripts de build/utilidades (Node .mjs, usan require/CommonJS); no se
    // lintean con las reglas TS de la app.
    "scripts/**",
  ]),
  {
    rules: {
      // Regla nueva del plugin react-hooks (Next 16). En este repo casi todos
      // los casos son sincronización de estado solo-cliente (sessionStorage,
      // cookie, hash de la URL, mapa) en el montaje, donde el effect es el
      // patrón correcto. La mantenemos como aviso, no error.
      "react-hooks/set-state-in-effect": "warn",
      // Respeta el prefijo `_` para descartes intencionales y el idioma de
      // omitir campos vía rest-siblings ({ photo: _p, ...rest }).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
