"use client";

import {
  RESPONSEGRID_EMERGENCY_URL,
  RESPONSEGRID_OFFER_HELP_URL,
  RESPONSEGRID_REQUEST_HELP_URL,
} from "@/lib/responsegrid";
import { deploymentConfig } from "@/lib/deployment-config";

export default function ResponseGridHubHeader() {
  return (
    <header className="e-m-rg-head">
      <div className="e-m-rg-head__inner">
        <div className="e-m-section__head">
          <span className="e-m-kicker">Red de suministros</span>
          <h2 className="e-m-section__title">ResponseGrid</h2>
          <hr className="e-m-section__rule" />
          <p className="e-m-section__sub">
            Centros de acopio y necesidades verificadas para {deploymentConfig.disasterName}.
          </p>
        </div>

        <div className="e-m-rg-head__actions">
          <a
            href={RESPONSEGRID_OFFER_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="e-m-btn e-m-btn--sm e-m-btn--secondary"
          >
            Ofrecer ayuda
          </a>
          <a
            href={RESPONSEGRID_REQUEST_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="e-m-btn e-m-btn--sm e-m-btn--primary"
          >
            Pedir ayuda
          </a>
          <a
            href={RESPONSEGRID_EMERGENCY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="e-m-rg-head__more"
          >
            Ver operativo <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </header>
  );
}
