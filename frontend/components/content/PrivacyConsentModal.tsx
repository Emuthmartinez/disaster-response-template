"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrivacyPolicyBody from "@/components/content/PrivacyPolicyBody";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useClientMount } from "@/hooks/useClientMount";
import { PRIVACY_COMPANY_NAME, PRIVACY_EFFECTIVE_DATE } from "@/lib/privacy-policy";
import { SITE_PRODUCT_NAME } from "@/lib/site";

const SCROLL_THRESHOLD_PX = 48;

type PrivacyConsentModalProps = {
  open: boolean;
  onAccept: () => void;
};

export default function PrivacyConsentModal({
  open,
  onAccept,
}: PrivacyConsentModalProps) {
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canAccept, setCanAccept] = useState(false);
  const mounted = useClientMount();
  useBodyScrollLock(open);

  const checkScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX;
    if (atBottom) setCanAccept(true);
  }, []);

  useEffect(() => {
    if (!open) {
      const id = requestAnimationFrame(() => setCanAccept(false));
      return () => cancelAnimationFrame(id);
    }
    const el = scrollRef.current;
    if (!el) return;
    checkScrollEnd();
    const ro = new ResizeObserver(checkScrollEnd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, checkScrollEnd]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      data-privacy-gate-overlay
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 p-4 sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="shrink-0 border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-slate-900 sm:text-xl">
            Política de Privacidad
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {SITE_PRODUCT_NAME} · {PRIVACY_COMPANY_NAME} · Vigente desde el{" "}
            {PRIVACY_EFFECTIVE_DATE}. Lee el documento completo antes de
            continuar.
          </p>
        </header>

        <div
          ref={scrollRef}
          onScroll={checkScrollEnd}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
        >
          <PrivacyPolicyBody />
          <div
            className="pointer-events-none mt-6 h-px w-full"
            aria-hidden
            data-scroll-end
          />
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          {!canAccept && (
            <p className="mb-3 text-center text-xs text-slate-500">
              Desplázate hasta el final del documento para habilitar el botón de
              aceptar.
            </p>
          )}
          <button
            type="button"
            disabled={!canAccept}
            onClick={onAccept}
            className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white transition enabled:hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            Acepto la Política de Privacidad
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
