"use client";

import { deploymentConfig } from "@/lib/deployment-config";
import { SITE_BRAND_NAME, SITE_PRODUCT_NAME } from "@/lib/site";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={deploymentConfig.languageTag}>
      <body className="global-error">
        <style>{`
          .global-error { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #eef2f7; color: #102a43; font-family: "Source Sans 3", sans-serif; }
          .global-error__flag { height: 5px; background: linear-gradient(to right, #2b51f0 0%, #1e40af 100%); }
          .global-error__header { padding: 14px 24px; border-bottom: 1px solid #dce3ec; background: #fff; font-family: Nunito, sans-serif; font-size: 18px; font-weight: 900; }
          .global-error__header small { display: block; color: #52606d; font: 600 11px/1.2 "Source Sans 3", sans-serif; text-transform: uppercase; letter-spacing: .08em; }
          .global-error__main { flex: 1; display: grid; place-items: center; padding: 24px; text-align: center; }
          .global-error__panel { max-width: 28rem; }
          .global-error__button { min-height: 44px; margin-top: 16px; padding: 10px 20px; border: 0; border-radius: 8px; background: #2b51f0; color: #fff; font: 700 16px/1 "Source Sans 3", sans-serif; cursor: pointer; }
          .global-error__footer { padding: 24px; background: #102a43; color: #c9d6e2; text-align: center; font-size: 13px; }
          @media (prefers-color-scheme: dark) { .global-error { background: #0b1526; color: #e8eff8; } .global-error__header { background: #132236; border-color: #28425c; } .global-error__header small { color: #a8b8c8; } }
        `}</style>
        <div aria-hidden className="global-error__flag" />
        <header className="global-error__header">
          {SITE_BRAND_NAME}
          <small>{SITE_PRODUCT_NAME}</small>
        </header>
        <main id="main" className="global-error__main">
          <div className="global-error__panel">
            <div style={{ fontSize: "3rem" }} aria-hidden>
              ⚠️
            </div>
            <h1
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: "1.5rem",
                fontWeight: 900,
                margin: "0.5rem 0",
              }}
            >
              Algo salió mal
            </h1>
            <p style={{ lineHeight: 1.5 }}>
              La aplicación tuvo un error inesperado. Recarga la página para
              continuar.
            </p>
            <button
              type="button"
              onClick={reset}
              className="global-error__button"
            >
              Recargar
            </button>
          </div>
        </main>
        <footer className="global-error__footer">
          Plataforma humanitaria de reporte ciudadano.
        </footer>
      </body>
    </html>
  );
}
