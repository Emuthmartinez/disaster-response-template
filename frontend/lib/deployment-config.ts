/**
 * Typed loader for `config/deployment.config.json` — the single source of
 * truth for per-deployment identity (org/product/disaster naming, map
 * defaults, contact address and public domains).
 *
 * The JSON ships with clearly-labeled EXAMPLE values. A real deployment
 * replaces them (by hand, or via a `disaster-configure` tooling step) before
 * going live. This loader validates the shape at import time: any deployment
 * missing a required key, or carrying an extra/unknown key, fails the build
 * loudly instead of silently shipping a half-configured site.
 */
import rawConfig from "../../config/deployment.config.json";

export interface DeploymentDomains {
  web: string;
  api: string;
  admin: string;
}

export interface DeploymentConfig {
  orgName: string;
  productName: string;
  disasterName: string;
  disasterType: string;
  regionLabel: string;
  /** [lat, lng] */
  mapCenter: [number, number];
  mapZoom: number;
  /** BCP-47 language tag, e.g. "es". */
  languageTag: string;
  contactEmail: string;
  domains: DeploymentDomains;
}

const REQUIRED_KEYS = [
  "orgName",
  "productName",
  "disasterName",
  "disasterType",
  "regionLabel",
  "mapCenter",
  "mapZoom",
  "languageTag",
  "contactEmail",
  "domains",
] as const;

const REQUIRED_DOMAIN_KEYS = ["web", "api", "admin"] as const;

function fail(message: string): never {
  throw new Error(`[deployment-config] ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an arbitrary object against the DeploymentConfig shape: every
 * required key must be present with the right type, and NO extra keys are
 * allowed (closed set) — this keeps config/deployment.config.json from
 * silently growing undocumented fields.
 */
function validateDeploymentConfig(value: unknown): DeploymentConfig {
  if (!isPlainObject(value)) {
    fail("config/deployment.config.json must be a JSON object.");
  }

  const keys = Object.keys(value);
  const unknownKeys = keys.filter(
    (key) => !REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number]),
  );
  if (unknownKeys.length > 0) {
    fail(
      `Unknown key(s) in config/deployment.config.json: ${unknownKeys.join(", ")}. ` +
        `Allowed keys are: ${REQUIRED_KEYS.join(", ")}.`,
    );
  }
  const missingKeys = REQUIRED_KEYS.filter((key) => !(key in value));
  if (missingKeys.length > 0) {
    fail(
      `Missing required key(s) in config/deployment.config.json: ${missingKeys.join(", ")}.`,
    );
  }

  const stringFields: Array<keyof DeploymentConfig> = [
    "orgName",
    "productName",
    "disasterName",
    "disasterType",
    "regionLabel",
    "languageTag",
    "contactEmail",
  ];
  for (const field of stringFields) {
    if (typeof value[field] !== "string" || value[field] === "") {
      fail(`"${field}" must be a non-empty string.`);
    }
  }

  if (
    !Array.isArray(value.mapCenter) ||
    value.mapCenter.length !== 2 ||
    !value.mapCenter.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    fail('"mapCenter" must be a [lat, lng] tuple of two finite numbers.');
  }
  const [lat, lng] = value.mapCenter as [number, number];
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    fail('"mapCenter" values must be valid latitude/longitude coordinates.');
  }

  if (typeof value.mapZoom !== "number" || !Number.isFinite(value.mapZoom)) {
    fail('"mapZoom" must be a finite number.');
  }

  if (!isPlainObject(value.domains)) {
    fail('"domains" must be an object with web/api/admin string keys.');
  }
  const domains = value.domains as Record<string, unknown>;
  const domainKeys = Object.keys(domains);
  const unknownDomainKeys = domainKeys.filter(
    (key) =>
      !REQUIRED_DOMAIN_KEYS.includes(
        key as (typeof REQUIRED_DOMAIN_KEYS)[number],
      ),
  );
  if (unknownDomainKeys.length > 0) {
    fail(
      `Unknown key(s) in "domains": ${unknownDomainKeys.join(", ")}. ` +
        `Allowed keys are: ${REQUIRED_DOMAIN_KEYS.join(", ")}.`,
    );
  }
  for (const key of REQUIRED_DOMAIN_KEYS) {
    if (typeof domains[key] !== "string" || domains[key] === "") {
      fail(`"domains.${key}" must be a non-empty string.`);
    }
  }

  return value as unknown as DeploymentConfig;
}

/** Validated, typed deployment configuration. Import this — never the raw JSON. */
export const deploymentConfig: DeploymentConfig =
  validateDeploymentConfig(rawConfig);

export default deploymentConfig;
