import { Phone } from "lucide-react";
import { deploymentConfig } from "@/lib/deployment-config";
import { EMERGENCY_CONTACT_GROUPS } from "@/lib/emergency-contacts";

const PRIMARY_ALERT =
  "Réplicas activas — Mantente alejado de estructuras dañadas";

const REGION_CONTEXT = `${deploymentConfig.disasterName} · Región: ${deploymentConfig.regionLabel}`;

/** Toma los primeros números de contacto de emergencia configurados
 *  (lib/emergency-contacts.ts) para el ticker rápido. */
const EMERGENCY_LINKS = EMERGENCY_CONTACT_GROUPS.flatMap((group) =>
  group.contacts.flatMap((contact) =>
    contact.numbers.map((number) => ({
      label: `${number} ${contact.name}`,
      href: `tel:${number.replace(/[^\d*+]/g, "")}`,
    })),
  ),
).slice(0, 4);

export default function AlertTicker() {
  return (
    <div
      className="e-m-ticker"
      role="region"
      aria-label="Alerta y teléfonos de emergencia"
    >
      <div className="e-m-ticker__badge">
        <span className="e-m-ticker__dot" aria-hidden />
        Alerta
      </div>
      <div className="e-m-ticker__content">
        <p className="e-m-ticker__lead">{PRIMARY_ALERT}</p>
        <div className="e-m-ticker__phones">
          <Phone size={14} strokeWidth={2.2} aria-hidden />
          {EMERGENCY_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="e-m-ticker__phone-link">
              {link.label}
            </a>
          ))}
        </div>
        <p className="e-m-ticker__meta">{REGION_CONTEXT}</p>
      </div>
    </div>
  );
}
