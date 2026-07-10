/**
 * Plugin ESLint LOCAL — reglas de arquitectura de endpoints, específicas de este
 * repo. Convierten la "guía de endpoints" (AGENTS.md/CLAUDE.md) en restricciones
 * EJECUTABLES, con feedback en el editor y gate en CI (estándar ESLint: una
 * regla custom para cada frontera arquitectónica).
 *
 * Reglas:
 *   require-rate-limit               — TODA ruta declara rateLimit(...).
 *   require-capability-in-public-api — handlers de src/public-api/** van gateados
 *                                      por requireCapability (o son del factory).
 *   no-turnstile-in-public-api       — la superficie máquina NO lleva requireHuman.
 *   user-facing-mutation-needs-guard — mutaciones de src/routes/** llevan
 *                                      requireHuman O un gate (capability/admin/cron).
 *
 * Modelo de detección: las rutas se montan con `router.<verbo>("path", ...mw,
 * handler)`. Inspeccionamos esa CallExpression y miramos los nombres de los
 * middleware (identificadores o llamadas) en los argumentos. Es AST, no regex,
 * así que el formato no lo engaña.
 */

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "all"]);
const MUTATING = new Set(["post", "put", "patch", "delete"]);

/** ¿La CallExpression es `router.<verbo>(...)` o `<algo>Router.<verbo>(...)`? */
function routeCall(node) {
  if (node.type !== "CallExpression") return null;
  const cal = node.callee;
  if (cal.type !== "MemberExpression" || cal.property.type !== "Identifier") return null;
  const verb = cal.property.name;
  if (!HTTP_VERBS.has(verb)) return null;
  // El objeto debe parecer un router (identificador que termina en "Router" o
  // se llama "router", o un app.<verbo>). Evita falsos positivos con .map()/.get()
  // de otros objetos.
  const objName =
    cal.object.type === "Identifier" ? cal.object.name : cal.object.type === "MemberExpression" && cal.object.property.type === "Identifier" ? cal.object.property.name : "";
  const looksRouter = /router$/i.test(objName) || objName === "app" || objName === "router";
  if (!looksRouter) return null;
  // Primer arg string = path; debe haber al menos el path.
  if (node.arguments.length < 1 || node.arguments[0].type !== "Literal") return null;
  return { verb, args: node.arguments.slice(1) };
}

/** Nombres de los middleware/handlers usados como args (identificador o llamada). */
function middlewareNames(args) {
  const names = [];
  for (const a of args) {
    if (a.type === "Identifier") names.push(a.name);
    else if (a.type === "CallExpression" && a.callee.type === "Identifier") names.push(a.callee.name);
    else if (
      a.type === "CallExpression" &&
      a.callee.type === "MemberExpression" &&
      a.callee.property.type === "Identifier"
    )
      names.push(a.callee.property.name);
  }
  return names;
}

const requireRateLimit = {
  meta: {
    type: "problem",
    docs: { description: "Toda ruta HTTP debe declarar rateLimit(...)." },
    schema: [],
    messages: {
      missing: "Esta ruta no declara rateLimit(...). Toda ruta debe limitar tasa (anti-abuso).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const rc = routeCall(node);
        if (!rc) return;
        const mw = middlewareNames(rc.args);
        if (!mw.includes("rateLimit")) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};

const requireCapabilityInPublicApi = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Handlers escritos a mano en src/public-api/** deben ir gateados por requireCapability. " +
        "Los routers generados por el factory ya lo aplican y no se tocan.",
    },
    schema: [],
    messages: {
      missing:
        "Ruta en public-api sin requireCapability(...). La superficie autenticada es deny-by-default.",
    },
  },
  create(context) {
    const file = context.filename || context.getFilename();
    if (!file.includes("/public-api/")) return {};
    // El factory mismo y el router de auth son excepciones: el factory ES quien
    // aplica el gate; auth.ts tiene rutas públicas legítimas (login/forgot).
    if (file.endsWith("crud-factory.ts") || file.endsWith("/routes/auth.ts")) return {};
    return {
      CallExpression(node) {
        const rc = routeCall(node);
        if (!rc) return;
        const mw = middlewareNames(rc.args);
        // requireAnyCapability(...) es un gate legítimo (OR de capacidades) para
        // recursos compartidos por varias funciones; cuenta como deny-by-default.
        if (!mw.includes("requireCapability") && !mw.includes("requireAnyCapability")) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};

const noTurnstileInPublicApi = {
  meta: {
    type: "problem",
    docs: {
      description:
        "La superficie api/public/* es máquina-a-máquina: NO debe usar requireHuman (Turnstile), " +
        "que bloquearía integraciones legítimas.",
    },
    schema: [],
    messages: {
      forbidden: "requireHuman (Turnstile) no va en api/public/* — es superficie de integración, no navegador.",
    },
  },
  create(context) {
    const file = context.filename || context.getFilename();
    if (!file.includes("/public-api/") && !file.endsWith("/routes/auth.ts")) return {};
    return {
      CallExpression(node) {
        const rc = routeCall(node);
        if (!rc) return;
        if (middlewareNames(rc.args).includes("requireHuman")) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

const userFacingMutationNeedsGuard = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Mutaciones (POST/PUT/PATCH/DELETE) de src/routes/** deben llevar requireHuman (Turnstile) " +
        "O un gate (requireCapability/requireAdmin/requireCron). Un write sin ninguno es abuso abierto.",
    },
    schema: [],
    messages: {
      unguarded:
        "Mutación user-facing sin protección. Añade requireHuman (Turnstile) o un gate " +
        "(requireAdmin/requireCapability/requireCron).",
    },
  },
  create(context) {
    const file = context.filename || context.getFilename();
    // routes/** (sitio público) y modules/** (integraciones DDD). public-api
    // tiene su propia regla (capability).
    if (!file.includes("/routes/") && !file.includes("/modules/")) return {};
    if (file.includes("/public-api/")) return {};
    // auth.ts: login/accept/forgot SON públicos por naturaleza (no puedes gatear
    // el propio login tras auth). Su protección es rateLimit, exigido por la otra
    // regla. Exento de la regla de gate.
    if (file.endsWith("/routes/auth.ts")) return {};
    const GATES = new Set([
      "requireHuman",
      "requireAdmin",
      "requireCapability",
      "requireCron",
      "requireSupplyWrite", // admin-o-POC token (hospitales: insumos)
    ]);
    return {
      CallExpression(node) {
        const rc = routeCall(node);
        if (!rc || !MUTATING.has(rc.verb)) return;
        const mw = middlewareNames(rc.args);
        if (!mw.some((m) => GATES.has(m))) {
          context.report({ node, messageId: "unguarded" });
        }
      },
    };
  },
};

export default {
  rules: {
    "require-rate-limit": requireRateLimit,
    "require-capability-in-public-api": requireCapabilityInPublicApi,
    "no-turnstile-in-public-api": noTurnstileInPublicApi,
    "user-facing-mutation-needs-guard": userFacingMutationNeedsGuard,
  },
};
