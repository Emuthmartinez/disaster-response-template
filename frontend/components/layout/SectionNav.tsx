"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HandCoins, MapPinned } from "lucide-react";
import TranslateWidget from "@/components/ui/TranslateWidget";
import { SiteBrand } from "./HeroSection";
import { toggleTheme } from "./ThemeProvider";
import { useMissingStats } from "@/hooks/useMissingStats";
import { SITE_PRODUCT_NAME } from "@/lib/site";
import {
  MOBILE_BAR_LINKS,
  PRIMARY_MAP_LINK,
  SECTION_LINKS,
  type SectionLink,
} from "@/lib/section-nav";

const SHARE_TEXT = `${SITE_PRODUCT_NAME}. Reporta y consulta el estado de las zonas en tiempo real.`;

const MOBILE_NAV_BOTTOM = "calc(3.25rem + env(safe-area-inset-bottom))";
const DESKTOP_HEADER_LINKS = [
  { href: "#mapa", label: "Mapa" },
  { href: "#e-directory", label: "Personas" },
  { href: "/acopio", label: "Acopio" },
  { href: "/guia", label: "Guía" },
] as const;

function isAnchor(href: string): boolean {
  return href.startsWith("#");
}

function resolveHref(href: string, onHome: boolean): string {
  if (!isAnchor(href)) return href;
  return onHome ? href : `/${href}`;
}

function scrollToSection(href: string) {
  const id = href.replace(/^#/, "");
  if (!id) return;

  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    return;
  }

  window.location.hash = id;
}

function useIosScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    document.body.classList.add("mobile-sheet-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      document.body.classList.remove("mobile-sheet-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

function usePeopleTotals() {
  const stats = useMissingStats();
  return { missing: stats?.active ?? null, found: stats?.found ?? null };
}

function compactBadge(value: string): string {
  const digits = value.replace(/\D/g, "");
  const n = Number(digits);
  if (Number.isNaN(n) || n < 1000) return value;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(n / 1000)}k`;
}

function badgeValue(
  link: SectionLink,
  missing: number | null,
  found: number | null,
): string | null {
  if (link.badge === "missing" && missing !== null) {
    return missing.toLocaleString("es");
  }
  if (link.badge === "found" && found !== null) {
    return found.toLocaleString("es");
  }
  return null;
}

function NavHeaderActions() {
  return (
    <div className="e-nav__actions">
      <TranslateWidget variant="header" />
      <DonateNavLink variant="desktop" />
    </div>
  );
}

function DonateNavLink({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "sheet";
  onNavigate?: () => void;
}) {
  const className =
    variant === "desktop"
      ? "e-nav__donate"
      : "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100";

  return (
    <Link
      href="/donaciones"
      onClick={onNavigate}
      className={className}
      aria-label="Ver formas de donar"
    >
      <HandCoins aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.2} />
      Donar
    </Link>
  );
}

export function HeroDesktopNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="e-nav">
      <div className="e-nav__inner">
        <SiteBrand
          onClick={onHome ? () => scrollToSection("main") : undefined}
        />
        <nav aria-label="Secciones principales" className="e-nav__menu">
          <div className="e-nav__links">
            {DESKTOP_HEADER_LINKS.map((link) => {
              const anchor = isAnchor(link.href);
              const href = anchor && !onHome ? `/${link.href}` : link.href;
              return (
                <a
                  key={link.href}
                  href={href}
                  aria-current={!anchor && pathname === link.href ? "page" : undefined}
                  onClick={(event) => {
                    if (!anchor || !onHome) return;
                    event.preventDefault();
                    scrollToSection(link.href);
                  }}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
          <NavHeaderActions />
        </nav>
      </div>
    </header>
  );
}

function ShareNavButton({ onAfterShare }: { onAfterShare?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    onAfterShare?.();
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: SITE_PRODUCT_NAME,
          text: SHARE_TEXT,
          url,
        });
        return;
      } catch {
        /* cancelado */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* sin permisos */
    }
  }, [onAfterShare]);

  return (
    <button type="button" onClick={handleShare} className="e-nav__share-btn">
      <span aria-hidden>🔗</span>
      {copied ? "Enlace copiado" : "Compartir mapa"}
    </button>
  );
}

export function MobileStickyNav() {
  const { missing, found } = usePeopleTotals();
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasSheetOpenRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === "/";

  useEffect(() => {
    document.body.classList.add("has-mobile-nav");
    return () => document.body.classList.remove("has-mobile-nav");
  }, []);

  useIosScrollLock(sheetOpen);

  useEffect(() => {
    if (!sheetOpen) {
      if (wasSheetOpenRef.current) {
        wasSheetOpenRef.current = false;
        menuButtonRef.current?.focus();
      }
      return;
    }

    wasSheetOpenRef.current = true;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const sheet = document.getElementById("mobile-section-sheet");
      const focusable = sheet?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const sheetLinks = SECTION_LINKS.filter((link) => !link.mobileBar);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, link: SectionLink) => {
      if (isAnchor(link.href) && onHome) {
        e.preventDefault();
        scrollToSection(link.href);
      }
    },
    [onHome],
  );

  const handleSheetClick = useCallback(
    (link: SectionLink) => {
      setSheetOpen(false);
      if (isAnchor(link.href) && onHome) {
        window.setTimeout(() => scrollToSection(link.href), 50);
        return;
      }
      const href = resolveHref(link.href, onHome);
      if (href.startsWith("#")) {
        window.location.href = `/${href}`;
        return;
      }
      router.push(href);
    },
    [onHome, router],
  );

  return (
    <>
      <nav aria-label="Navegación rápida" className="e-nav__mobile-bar">
        <div className="e-nav__mobile-bar-grid">
          {MOBILE_BAR_LINKS.map((link) => {
            const badge = badgeValue(link, missing, found);
            return (
              <a
                key={link.href}
                href={resolveHref(link.href, onHome)}
                onClick={(e) => handleBarClick(e, link)}
                className="e-nav__mobile-bar-item"
              >
                <span className="e-nav__mobile-bar-icon" aria-hidden>
                  {link.icon}
                  {badge && (
                    <span className="e-nav__mobile-badge">
                      {compactBadge(badge)}
                    </span>
                  )}
                </span>
                <span className="e-nav__mobile-bar-label">{link.shortLabel}</span>
              </a>
            );
          })}
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            aria-controls="mobile-section-sheet"
            onClick={() => setSheetOpen((open) => !open)}
            className="e-nav__mobile-bar-item"
          >
            <span className="e-nav__mobile-bar-icon" aria-hidden>
              {sheetOpen ? "×" : "☰"}
            </span>
            {sheetOpen ? "Cerrar" : "Más"}
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú de secciones"
            style={{ bottom: MOBILE_NAV_BOTTOM }}
            className="e-nav__sheet-backdrop"
            onClick={closeSheet}
          />

          <div
            id="mobile-section-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Más secciones"
            style={{ bottom: MOBILE_NAV_BOTTOM }}
            className="e-nav__sheet"
          >
            <div className="e-nav__sheet-header">
              <p className="e-nav__sheet-title">Más secciones</p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeSheet}
                aria-label="Cerrar menú"
                className="e-nav__sheet-close"
              >
                ×
              </button>
            </div>
            <ul className="e-nav__sheet-list">
              {sheetLinks.map((link) => {
                const badge = badgeValue(link, missing, found);
                return (
                  <li key={link.href}>
                    <button
                      type="button"
                      onClick={() => handleSheetClick(link)}
                      className="e-nav__sheet-item-btn"
                    >
                      <span className="e-nav__sheet-item-icon" aria-hidden>
                        {link.icon}
                      </span>
                      <span className="e-nav__sheet-item-label">{link.label}</span>
                      {badge && (
                        <span className="e-nav__sheet-item-badge">{badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
              <li className="e-nav__sheet-section">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    closeSheet();
                  }}
                  className="e-nav__sheet-item-btn"
                >
                  <span className="e-nav__sheet-item-icon" aria-hidden>
                    🌓
                  </span>
                  Cambiar tema claro/oscuro
                </button>
              </li>
              <li className="e-nav__sheet-section">
                <DonateNavLink variant="sheet" onNavigate={closeSheet} />
              </li>
              <li className="e-nav__sheet-section">
                <div className="e-nav__share-row">
                  <div className="e-nav__share-col">
                    <ShareNavButton onAfterShare={closeSheet} />
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

export function HeroMobileCta() {
  return (
    <a
      href={PRIMARY_MAP_LINK.href}
      onClick={(e) => {
        if (window.matchMedia("(max-width: 767px)").matches) {
          e.preventDefault();
          scrollToSection(PRIMARY_MAP_LINK.href);
        }
      }}
      className="e-hero__mobile-cta"
    >
      <span aria-hidden>{PRIMARY_MAP_LINK.icon}</span>
      {PRIMARY_MAP_LINK.label}
    </a>
  );
}

export function MobileBackToMapCta() {
  return (
    <Link href="/#mapa" prefetch={false} className="e-hero__back-to-map">
      <MapPinned aria-hidden className="h-4 w-4" strokeWidth={2.2} />
      Volver al mapa
    </Link>
  );
}
