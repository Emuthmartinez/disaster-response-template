"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import {
  TRANSLATE_LANGS,
  TRANSLATE_SOURCE_LANG,
  comboValueToLang,
  googTransCookieAssignments,
  googTransCookieValue,
  readGoogTransTarget,
  type TranslateLangCode,
} from "@/lib/translate";

declare global {
  interface Node {
    /** Marca de patchDomForGoogleTranslate para instalarlo una sola vez. */
    __gtPatched?: boolean;
  }
  interface Window {
    google?: {
      translate?: {
        TranslateElement: new (
          opts: {
            pageLanguage: string;
            includedLanguages: string;
            autoDisplay: boolean;
          },
          id: string,
        ) => void;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

const COMBO_POLL_MAX = 30;
const COMBO_POLL_MS = 100;

function getCookieLang(): TranslateLangCode {
  return readGoogTransTarget(document.cookie);
}

function writeGoogTransCookie(targetLang: TranslateLangCode) {
  const value = googTransCookieValue(targetLang);
  for (const assignment of googTransCookieAssignments(
    value,
    window.location.hostname,
  )) {
    document.cookie = assignment;
  }
}

/** Misma lógica para es/en/pt: cookie `googtrans=/es/<lang>` y reload. */
function selectLang(targetLang: TranslateLangCode) {
  if (targetLang === getCookieLang()) return;
  writeGoogTransCookie(targetLang);
  window.location.reload();
}

/**
 * Workaround del crash React + Google Translate: GT envuelve los text nodes en
 * <font>, así que cuando React intenta removeChild/insertBefore sobre el nodo
 * original (que ya no es hijo directo) lanza NotFoundError y desmonta el árbol
 * — botones que dejan de responder o pantalla en blanco tras traducir. El parche
 * degrada esos dos casos a no-op/append, tal como recomienda el issue de React
 * (facebook/react#11538). Solo se instala una vez y no afecta al DOM sin GT.
 */
function patchDomForGoogleTranslate() {
  if (typeof Node !== "function" || Node.prototype.__gtPatched) return;
  Node.prototype.__gtPatched = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

function attachComboListener(onLang: (lang: TranslateLangCode) => void) {
  let select: HTMLSelectElement | null = null;
  let handler: (() => void) | null = null;
  let attempts = 0;

  const tryAttach = () => {
    select = document.querySelector(".goog-te-combo");
    if (!select) {
      if (attempts++ < COMBO_POLL_MAX) {
        window.setTimeout(tryAttach, COMBO_POLL_MS);
      }
      return;
    }
    handler = () => onLang(comboValueToLang(select!.value));
    select.addEventListener("change", handler);
  };
  tryAttach();

  return () => {
    if (select && handler) select.removeEventListener("change", handler);
  };
}

function initGoogleTranslate() {
  if (!window.google?.translate?.TranslateElement) return;
  new window.google.translate.TranslateElement(
    {
      pageLanguage: TRANSLATE_SOURCE_LANG,
      includedLanguages: "en,pt",
      autoDisplay: false,
    },
    "google-translate-container",
  );
}

export default function TranslateWidget({
  variant = "default",
}: {
  variant?: "default" | "header";
}) {
  const [open, setOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<TranslateLangCode>(() =>
    typeof document === "undefined" ? TRANSLATE_SOURCE_LANG : getCookieLang(),
  );
  const ref = useRef<HTMLDivElement>(null);

  const handleLangApplied = useCallback((lang: TranslateLangCode) => {
    setActiveLang(lang);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    patchDomForGoogleTranslate();

    if (document.getElementById("google-translate-script")) {
      return attachComboListener(handleLangApplied);
    }

    window.googleTranslateElementInit = initGoogleTranslate;

    const script = document.createElement("script");
    script.id = "google-translate-script";
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);

    return attachComboListener(handleLangApplied);
  }, [handleLangApplied]);

  const current = TRANSLATE_LANGS.find((lang) => lang.code === activeLang)!;
  const isTranslated = activeLang !== TRANSLATE_SOURCE_LANG;

  return (
    <div ref={ref} className="notranslate relative" translate="no">
      <div id="google-translate-container" className="hidden" aria-hidden />
      <button
        type="button"
        aria-label="Cambiar idioma de la página"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "header"
            ? `e-nav__language${isTranslated ? " e-nav__language--active" : ""}`
            : `inline-flex h-9 min-h-0 shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 text-xs font-bold transition ${
                isTranslated
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-[var(--eborder)] bg-[var(--esurf)] text-[var(--etext2)] hover:bg-[var(--einput)]"
              }`
        }
        title={`Idioma: ${current.label}`}
      >
        {variant === "header" ? (
          <>
            <Languages aria-hidden className="h-4 w-4" strokeWidth={2.2} />
            <span>{current.code.toUpperCase()}</span>
          </>
        ) : isTranslated ? (
          <span aria-hidden>{current.flag}</span>
        ) : (
          <Languages aria-hidden className="h-4 w-4" strokeWidth={2.2} />
        )}
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[2000] mt-1.5 min-w-[10rem] animate-[fadeUp_0.18s_ease-out] overflow-hidden rounded-xl border border-[var(--eborder)] bg-[var(--esurf)] shadow-xl">
          {TRANSLATE_LANGS.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                setOpen(false);
                selectLang(lang.code);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-[var(--einput)] ${
                activeLang === lang.code
                  ? "bg-[var(--einput)] font-semibold text-[var(--etext)]"
                  : "font-medium text-[var(--etext2)]"
              }`}
            >
              <span aria-hidden>{lang.flag}</span>
              {lang.label}
              {activeLang === lang.code && (
                <span className="ml-auto text-xs text-[var(--etext3)]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
