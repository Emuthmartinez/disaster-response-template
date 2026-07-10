"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  REPORT_TYPES,
  REPORT_TYPE_KEYS,
  type MissingPerson,
  type ReportType,
} from "@/lib/types";
import AdminLogin from "@/components/features/emergency/AdminLogin";
import { formatDonationUsd } from "@/lib/donation-shared";
import { apiFetch, mediaUrl } from "@/lib/api";
import HospitalSuppliesPanel from "./HospitalSuppliesPanel";

const ADMIN_STORAGE_KEY = "emergency:adminToken";
const POLL_INTERVAL_MS = 7000;
const OPENPANEL_CLIENT_ID = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
const OPENPANEL_DASHBOARD_URL = process.env.NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL;
const OPENPANEL_REALTIME_URL = OPENPANEL_DASHBOARD_URL
  ? `${OPENPANEL_DASHBOARD_URL.replace(/\/$/, "")}/realtime`
  : "";
const OPENPANEL_EVENTS_URL = OPENPANEL_DASHBOARD_URL
  ? `${OPENPANEL_DASHBOARD_URL.replace(/\/$/, "")}/events`
  : "";

interface Report {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  place: string;
  affected: number;
  needs: string;
  photoUrl: string | null;
  confirmations: number;
  createdAt: number;
}
interface Message {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}
interface SyncRun {
  source: string;
  trigger: string | null;
  ok: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  fromPage: number | null;
  toPage: number | null;
  cycleCompleted: boolean | null;
  error: string | null;
  durationMs: number;
  startedAt: number;
}
interface SyncStateRow {
  source: string;
  nextPage: number;
  totalPages: number | null;
  lastRunAt: number | null;
  lastCycleCompletedAt: number | null;
}
interface DuplicateGroup {
  name: string;
  count: number;
  distinctAges: number;
  distinctLocations: number;
  classification: "same-person" | "homonyms";
}
interface DuplicateReport {
  totalRows: number;
  duplicateGroups: number;
  collapsibleRows: number;
  samePersonGroups: number;
  samePersonCollapsible: number;
  homonymGroups: number;
  topGroups: DuplicateGroup[];
  generatedAt: number;
}
interface AdminData {
  generatedAt: number;
  persistent: boolean;
  sync?: { runs: SyncRun[]; state: SyncStateRow[] };
  stats: {
    reports: {
      total: number;
      byType: Record<ReportType, number>;
      totalAffected: number;
      lastHour: number;
      last24h: number;
      withPhoto: number;
    };
    chat: { total: number; lastHour: number };
    missing: {
      total: number;
      active?: number;
      found?: number;
      withPhoto: number;
    };
  };
  reports: Report[];
  messages: Message[];
  people: Person[];
}

type Person = MissingPerson;

interface DonationRow {
  id: string;
  name: string;
  amountCents: number;
  createdAt: number;
}

interface AdminDonationsData {
  generatedAt: number;
  stats: {
    count: number;
    totalCents: number;
    last24hCount: number;
    last24hCents: number;
  };
  donations: DonationRow[];
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: number;
}

interface AdminContactData {
  generatedAt: number;
  stats: {
    total: number;
    unread: number;
    last24h: number;
  };
  messages: ContactRow[];
}

// Conteos de la federación del hub (otros sitios). /api/hub/stats. RFC 0002.
interface HubTypeStat {
  type: string;
  count: number;
  photos?: number;
  broken?: number;
  lastIngestedAt: number | null;
}
interface HubStats {
  total: number;
  byType: HubTypeStat[];
}

const HUB_TYPE_LABEL: Record<string, string> = {
  missing_person: "Desaparecidas",
  checkin: "Check-ins",
  help_request: "Solicitudes de ayuda",
  help_offer: "Ofertas de ayuda",
  damaged_building: "Edificios dañados",
};

type Tab =
  | "analytics"
  | "supplies"
  | "reports"
  | "chat"
  | "missing"
  | "donations"
  | "contact";
type RemovableTab = "reports" | "chat" | "missing";

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("es");
}

function extractPhone(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? digits : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className="mt-1 text-3xl font-bold"
        style={{ color: accent ?? "#0f172a" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [donationsData, setDonationsData] = useState<AdminDonationsData | null>(
    null,
  );
  const [contactData, setContactData] = useState<AdminContactData | null>(null);
  const [hubStats, setHubStats] = useState<HubStats | null>(null);
  const [tab, setTab] = useState<Tab>("analytics");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dupReport, setDupReport] = useState<DuplicateReport | null>(null);
  const [loadingDup, setLoadingDup] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setToken(sessionStorage.getItem(ADMIN_STORAGE_KEY));
      setReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const login = useCallback((t: string) => {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, t);
    setToken(t);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setToken(null);
    setData(null);
  }, []);

  const fetchData = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current) return;
    try {
      const res = await apiFetch("/api/admin/data", {
        headers: { "x-admin-token": current },
        cache: "no-store",
      });
      if (res.status === 401) {
        logout();
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) return;
      setData(await res.json());
      setError(null);
    } catch {
      // se reintenta en el siguiente ciclo
    }
  }, [logout]);

  const fetchDonations = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current) return;
    try {
      const res = await apiFetch("/api/admin/donations", {
        headers: { "x-admin-token": current },
        cache: "no-store",
      });
      if (res.status === 401) {
        logout();
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) return;
      setDonationsData(await res.json());
      setError(null);
    } catch {
      // se reintenta en el siguiente ciclo
    }
  }, [logout]);

  const fetchContact = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current) return;
    try {
      const res = await apiFetch("/api/admin/contact", {
        headers: { "x-admin-token": current },
        cache: "no-store",
      });
      if (res.status === 401) {
        logout();
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) return;
      setContactData(await res.json());
      setError(null);
    } catch {
      // se reintenta en el siguiente ciclo
    }
  }, [logout]);

  // Conteos de la federación (público, sin PII): no necesita token.
  const fetchHubStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/hub/stats", { cache: "no-store" });
      if (!res.ok) return;
      setHubStats(await res.json());
    } catch {
      // se reintenta en el siguiente ciclo
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const tick = () => {
      requestAnimationFrame(() => {
        if (!cancelled) fetchHubStats();
      });
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, fetchHubStats]);

  useEffect(() => {
    if (!token) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      fetchData();
      interval = setInterval(fetchData, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, fetchData]);

  useEffect(() => {
    if (!token || tab !== "donations") return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      fetchDonations();
      interval = setInterval(fetchDonations, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, tab, fetchDonations]);

  useEffect(() => {
    if (!token || tab !== "contact") return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      fetchContact();
      interval = setInterval(fetchContact, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, tab, fetchContact]);

  const markContactRead = useCallback(
    async (id: string) => {
      const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
      if (!current) return;
      setContactData((prev) => {
        if (!prev) return prev;
        const target = prev.messages.find((m) => m.id === id);
        if (!target || target.read) return prev;
        return {
          ...prev,
          stats: { ...prev.stats, unread: Math.max(0, prev.stats.unread - 1) },
          messages: prev.messages.map((m) =>
            m.id === id ? { ...m, read: true } : m,
          ),
        };
      });
      await apiFetch("/api/admin/contact", {
        method: "PATCH",
        headers: {
          "x-admin-token": current,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    },
    [],
  );

  const remove = useCallback(
    async (kind: RemovableTab, id: string) => {
      if (!token) return;
      const endpoint =
        kind === "reports"
          ? `/api/reports/${id}`
          : kind === "chat"
            ? `/api/chat/${id}`
            : `/api/missing/${id}`;
      setData((prev) => {
        if (!prev) return prev;
        if (kind === "reports")
          return { ...prev, reports: prev.reports.filter((r) => r.id !== id) };
        if (kind === "chat")
          return { ...prev, messages: prev.messages.filter((m) => m.id !== id) };
        return { ...prev, people: prev.people.filter((p) => p.id !== id) };
      });
      await apiFetch(endpoint, {
        method: "DELETE",
        headers: { "x-admin-token": token },
      }).catch(() => {});
    },
    [token],
  );

  const runSyncNow = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current || syncing) return;
    setSyncing(true);
    try {
      await apiFetch("/api/sync/run?mode=chunk", {
        method: "POST",
        headers: { "x-admin-token": current },
      });
      await fetchData();
    } catch {
      // se refleja en el próximo poll
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchData]);

  const resetCursor = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current) return;
    if (!window.confirm("¿Reiniciar el cursor a la página 1? El próximo barrido empezará desde el inicio.")) {
      return;
    }
    try {
      await apiFetch("/api/sync/reset", {
        method: "POST",
        headers: { "x-admin-token": current },
      });
      await fetchData();
    } catch {
      // se refleja en el próximo poll
    }
  }, [fetchData]);

  const loadDuplicates = useCallback(async () => {
    const current = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!current || loadingDup) return;
    setLoadingDup(true);
    try {
      // El reporte ya no corre inline (audit M-2): se encola y se hace
      // status-poll hasta que termina (patrón estándar 202 + poll).
      const enq = await apiFetch("/api/sync/duplicates?limit=50", {
        method: "POST",
        headers: { "x-admin-token": current },
        cache: "no-store",
      });
      if (!enq.ok) return;
      const { jobId } = await enq.json();
      if (!jobId) return;

      // Poll cada 1.5s hasta completed/failed o timeout (~90s).
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const sres = await apiFetch(
          `/api/sync/status?jobId=${encodeURIComponent(jobId)}`,
          { headers: { "x-admin-token": current }, cache: "no-store" },
        );
        if (!sres.ok) continue;
        const st = await sres.json();
        if (st.state === "completed") {
          setDupReport(st.result);
          setDupOpen(true);
          return;
        }
        if (st.state === "failed") return; // falló; el botón permite reintentar
      }
    } catch {
      // se puede reintentar
    } finally {
      setLoadingDup(false);
    }
  }, [loadingDup]);

  const filteredReports = useMemo(() => {
    if (!data) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return data.reports.filter((r) => {
      if (terms.length === 0) return true;
      const hay = normalize(`${r.place} ${r.needs} ${REPORT_TYPES[r.type].label}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [data, query]);

  const filteredMessages = useMemo(() => {
    if (!data) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return data.messages.filter((m) => {
      if (terms.length === 0) return true;
      const hay = normalize(`${m.name} ${m.text}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [data, query]);

  const filteredPeople = useMemo(() => {
    if (!data) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return data.people.filter((p) => {
      if (terms.length === 0) return true;
      const hay = normalize(`${p.name} ${p.lastSeen} ${p.description} ${p.contact}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [data, query]);

  const filteredDonations = useMemo(() => {
    if (!donationsData) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return donationsData.donations.filter((donation) => {
      if (terms.length === 0) return true;
      const hay = normalize(`${donation.name} ${formatDonationUsd(donation.amountCents)}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [donationsData, query]);

  const filteredContactMessages = useMemo(() => {
    if (!contactData) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return contactData.messages.filter((message) => {
      if (terms.length === 0) return true;
      const hay = normalize(
        `${message.name} ${message.email} ${message.subject} ${message.message}`,
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [contactData, query]);

  const exportDonationsCsv = useCallback(() => {
    if (!filteredDonations.length) return;
    const rows = [
      ["nombre", "monto_usd", "fecha"],
      ...filteredDonations.map((donation) => [
        donation.name,
        (donation.amountCents / 100).toFixed(2),
        new Date(donation.createdAt).toISOString(),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `donaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredDonations]);

  if (!ready) return null;

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <AdminLogin
          onCancel={() => {
            window.location.href = "/";
          }}
          onSuccess={login}
        />
      </main>
    );
  }

  const stats = data?.stats;

  return (
    <main id="main" className="min-h-screen bg-slate-100 pb-16">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              📊 Panel de administración
            </h1>
            <p className="text-xs text-slate-500">
              {data
                ? `Actualizado ${timeAgo(data.generatedAt)}`
                : "Cargando datos…"}
              {data && !data.persistent && " · ⚠️ Modo demo (sin persistencia)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {OPENPANEL_DASHBOARD_URL && (
              <a
                href={OPENPANEL_DASHBOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                OpenPanel
              </a>
            )}
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver sitio
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Reportes"
            value={stats?.reports.total ?? "—"}
            sub={
              stats ? `${stats.reports.lastHour} en la última hora` : undefined
            }
            accent="#dc2626"
          />
          <MetricCard
            label="Personas afectadas"
            value={stats?.reports.totalAffected ?? "—"}
            sub="Suma reportada"
          />
          <MetricCard
            label="Desaparecidas"
            value={stats?.missing.active ?? stats?.missing.total ?? "—"}
            sub={
              stats
                ? `${stats.missing.found ?? 0} localizadas · ${stats.missing.withPhoto} con foto`
                : undefined
            }
            accent="#9333ea"
          />
          <MetricCard
            label="Mensajes (chat)"
            value={stats?.chat.total ?? "—"}
            sub={stats ? `${stats.chat.lastHour} en la última hora` : undefined}
          />
          <MetricCard
            label="Reportes 24 h"
            value={stats?.reports.last24h ?? "—"}
            sub="Últimas 24 horas"
            accent="#0ea5e9"
          />
        </div>

        {stats && (
          <div className="mt-3 flex flex-wrap gap-2">
            {REPORT_TYPE_KEYS.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm"
              >
                <span>{REPORT_TYPES[type].emoji}</span>
                <span className="text-slate-500">{REPORT_TYPES[type].label}:</span>
                <span className="font-semibold text-slate-900">
                  {stats.reports.byType[type] ?? 0}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Federación: datos sincronizados desde OTROS sitios (hub central). RFC 0002. */}
        {hubStats && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Federación · datos de otros sitios
              </h2>
              <span className="text-sm text-slate-500">
                {hubStats.total.toLocaleString("es")} registros sincronizados
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {hubStats.byType.map((s) => (
                <span
                  key={s.type}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm"
                  title={
                    s.lastIngestedAt
                      ? `Último: ${new Date(s.lastIngestedAt).toLocaleString("es")}`
                      : "Sin sincronizar aún"
                  }
                >
                  <span className="text-slate-500">
                    {HUB_TYPE_LABEL[s.type] ?? s.type}:
                  </span>
                  <span className="font-semibold text-slate-900">
                    {s.count.toLocaleString("es")}
                  </span>
                  {s.photos !== undefined && (
                    <span className="text-xs text-slate-400">
                      ({s.photos} con foto
                      {s.broken ? `, ${s.broken} rotas` : ""})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              🔄 Sincronización de fuentes
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetCursor}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reiniciar cursor
              </button>
              <button
                type="button"
                onClick={runSyncNow}
                disabled={syncing}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {syncing ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
            </div>
          </div>

          {data?.sync?.state && data.sync.state.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.sync.state.map((s) => (
                <span
                  key={s.source}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
                >
                  <span className="font-medium text-slate-800">{s.source}</span>
                  <span>
                    · pág {s.nextPage}
                    {s.totalPages ? `/${s.totalPages}` : ""}
                  </span>
                  {s.lastRunAt && (
                    <span className="text-slate-400">· {timeAgo(s.lastRunAt)}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {data?.sync?.runs && data.sync.runs.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 text-xs">
              {data.sync.runs.map((r, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5"
                >
                  <span className={r.ok ? "text-emerald-600" : "text-red-600"}>
                    {r.ok ? "✓" : "✕"}
                  </span>
                  <span className="text-slate-400">{timeAgo(r.startedAt)}</span>
                  <span className="rounded bg-slate-100 px-1.5 text-slate-600">
                    {r.trigger ?? "?"}
                  </span>
                  <span className="text-slate-700">
                    pág {r.fromPage ?? "?"}–{r.toPage ?? "?"} · +{r.inserted} nuevos
                    {" / "}
                    {r.updated} act.
                    {r.errors > 0 && ` · ${r.errors} err`}
                    {r.cycleCompleted && " · ciclo ✓"}
                  </span>
                  {r.error && <span className="text-red-600">{r.error}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Aún no hay corridas registradas.
            </p>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                🔎 Reporte de posibles duplicados
              </h3>
              <div className="flex items-center gap-2">
                {dupReport && (
                  <button
                    type="button"
                    onClick={() => setDupOpen((v) => !v)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {dupOpen ? "▲ Ocultar" : "▼ Mostrar"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={loadDuplicates}
                  disabled={loadingDup}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingDup ? "Analizando…" : dupReport ? "Regenerar" : "Generar reporte"}
                </button>
              </div>
            </div>

            {dupReport && dupOpen && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricCard
                    label="Grupos con duplicados"
                    value={dupReport.duplicateGroups}
                    sub={`de ${dupReport.totalRows} registros`}
                  />
                  <MetricCard
                    label="Probable misma persona"
                    value={dupReport.samePersonGroups}
                    sub={`~${dupReport.samePersonCollapsible} filas colapsables`}
                    accent="#16a34a"
                  />
                  <MetricCard
                    label="Posibles homónimos"
                    value={dupReport.homonymGroups}
                    sub="revisar a mano (no agrupar)"
                    accent="#dc2626"
                  />
                  <MetricCard
                    label="Filas colapsables (techo)"
                    value={dupReport.collapsibleRows}
                    sub="si se colapsara todo"
                  />
                </div>

                <ul className="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 text-xs">
                  {dupReport.topGroups.map((g, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          g.classification === "same-person"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {g.classification === "same-person"
                          ? "misma persona"
                          : "homónimos"}
                      </span>
                      <span className="font-medium text-slate-900">{g.name}</span>
                      <span className="text-slate-500">
                        {g.count} registros · {g.distinctAges} edad(es) ·{" "}
                        {g.distinctLocations} ubicación(es)
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-400">
                  Solo detección — no se modifica ni agrupa nada todavía.
                  &quot;misma persona&quot; = edad consistente; &quot;homónimos&quot;
                  = varias edades (probablemente personas distintas).
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200">
          {(
            [
              ["analytics", "Analytics"],
              ["supplies", "Insumos hospitalarios"],
              ["reports", `Reportes (${data?.reports.length ?? 0})`],
              ["missing", `Desaparecidas (${data?.people.length ?? 0})`],
              ["chat", `Chat (${data?.messages.length ?? 0})`],
              [
                "donations",
                `Donaciones (${donationsData?.stats.count ?? 0})`,
              ],
              [
                "contact",
                `Contacto (${contactData?.stats.unread ?? 0} nuevos)`,
              ],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "analytics" && (
          <div className="relative mt-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en esta sección…"
              className="w-full max-w-md rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-900"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔎
            </span>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tab === "analytics" && (
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    OpenPanel
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    Usuarios en vivo y tráfico
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Las métricas de tráfico se muestran desde OpenPanel. Si ves
                    una pantalla de login, inicia sesión en OpenPanel en este
                    navegador y vuelve a cargar el admin.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {OPENPANEL_REALTIME_URL && (
                    <a
                      href={OPENPANEL_REALTIME_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Realtime
                    </a>
                  )}
                  {OPENPANEL_EVENTS_URL && (
                    <a
                      href={OPENPANEL_EVENTS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Eventos
                    </a>
                  )}
                    {OPENPANEL_DASHBOARD_URL ? (
                      <a
                        href={OPENPANEL_DASHBOARD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Abrir OpenPanel
                      </a>
                    ) : (
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                        Falta NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL
                      </span>
                    )}
                </div>
              </div>
              {OPENPANEL_DASHBOARD_URL ? (
                <iframe
                  title="OpenPanel analytics"
                  src={OPENPANEL_DASHBOARD_URL}
                  className="h-[75vh] min-h-[680px] w-full bg-white"
                  referrerPolicy="no-referrer-when-downgrade"
                  loading="lazy"
                />
              ) : (
                <div className="p-6">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Configura `NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL` en Vercel y
                    vuelve a desplegar para mostrar el dashboard aquí.
                  </div>
                </div>
              )}
              <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-4 text-sm md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-slate-500">SDK</span>
                  <p className="font-semibold text-emerald-700">Instalado</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-slate-500">Client ID</span>
                  <p
                    className={
                      OPENPANEL_CLIENT_ID
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-amber-700"
                    }
                  >
                    {OPENPANEL_CLIENT_ID ? "Configurado" : "Pendiente"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-slate-500">Tracking local</span>
                  <p className="font-semibold text-slate-900">
                    Desactivado fuera de producción
                  </p>
                </div>
              </div>
            </section>
          )}

          {tab === "supplies" && <HospitalSuppliesPanel token={token} query={query} />}

          {tab === "reports" && (
            <ul className="divide-y divide-slate-100">
              {filteredReports.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500">
                  Sin reportes.
                </li>
              ) : (
                filteredReports.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 p-3">
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(r.photoUrl)}
                        alt={r.place}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <div
                        className="grid h-16 w-16 shrink-0 place-items-center rounded-lg text-2xl text-white"
                        style={{ background: REPORT_TYPES[r.type].color }}
                        aria-hidden
                      >
                        {REPORT_TYPES[r.type].icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {r.place}
                      </p>
                      <p className="text-xs text-slate-500">
                        {REPORT_TYPES[r.type].label}
                        {r.affected > 0 && ` · ${r.affected} afectada(s)`} ·{" "}
                        {fmt(r.createdAt)}
                      </p>
                      {r.needs && (
                        <p className="mt-0.5 text-xs text-slate-600">{r.needs}</p>
                      )}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-xs text-sky-700 hover:underline"
                      >
                        Ver ubicación ↗
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove("reports", r.id)}
                      className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          {tab === "missing" && (
            <ul className="divide-y divide-slate-100">
              {filteredPeople.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500">
                  Sin personas reportadas.
                </li>
              ) : (
                filteredPeople.map((p) => {
                  const phone = extractPhone(p.contact);
                  const personMeta = [
                    p.age !== null ? `${p.age} años` : null,
                    p.nationality || null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={p.id} className="flex items-start gap-3 p-3">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaUrl(p.photoUrl)}
                          alt={p.name}
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-slate-100 text-2xl text-slate-400">
                          🧍
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {p.name}
                          {personMeta && (
                            <span className="font-normal text-slate-500">
                              {" "}
                              · {personMeta}
                            </span>
                          )}
                        </p>
                        {p.lastSeen && (
                          <p className="text-xs text-slate-600">📍 {p.lastSeen}</p>
                        )}
                        {p.description && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            {p.description}
                          </p>
                        )}
                        {p.contact &&
                          (phone ? (
                            <a
                              href={`tel:${phone}`}
                              className="text-xs font-medium text-red-700 hover:underline"
                            >
                              📞 {p.contact}
                            </a>
                          ) : (
                            <p className="text-xs text-slate-700">{p.contact}</p>
                          ))}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {fmt(p.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {p.status === "found" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            ✓ Localizada
                          </span>
                        )}
                        {p.status === "found" && token && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/missing/${p.id}/restore`, {
                                method: "POST",
                                headers: { "x-admin-token": token },
                              }).catch(() => null);
                              fetchData();
                            }}
                            className="rounded-md border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            Restaurar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => remove("missing", p.id)}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          )}

          {tab === "chat" && (
            <ul className="divide-y divide-slate-100">
              {filteredMessages.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500">
                  Sin mensajes.
                </li>
              ) : (
                filteredMessages
                  .slice()
                  .reverse()
                  .map((m) => (
                    <li key={m.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-semibold text-slate-900">
                            {m.name}
                          </span>{" "}
                          <span className="text-[11px] text-slate-400">
                            {fmt(m.createdAt)}
                          </span>
                        </p>
                        <p className="text-sm text-slate-700">{m.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove("chat", m.id)}
                        className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </li>
                  ))
              )}
            </ul>
          )}

          {tab === "contact" && (
            <section>
              <div className="border-b border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Buzón de contacto
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  Mensajes del formulario
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Los visitantes escriben desde{" "}
                  <Link href="/contacto" className="font-medium underline">
                    /contacto
                  </Link>
                  . Responde por correo o marca como leído cuando lo atiendas.
                </p>
              </div>

              <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
                <MetricCard
                  label="Total"
                  value={contactData?.stats.total ?? "—"}
                  sub="Mensajes recibidos"
                />
                <MetricCard
                  label="Sin leer"
                  value={contactData?.stats.unread ?? "—"}
                  sub="Pendientes de revisar"
                  accent="#0284c7"
                />
                <MetricCard
                  label="Últimas 24 h"
                  value={contactData?.stats.last24h ?? "—"}
                  sub="Mensajes del último día"
                  accent="#6366f1"
                />
              </div>

              <ul className="divide-y divide-slate-100">
                {filteredContactMessages.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    {contactData ? "Sin mensajes." : "Cargando mensajes…"}
                  </li>
                ) : (
                  filteredContactMessages.map((message) => (
                    <li
                      key={message.id}
                      className={`p-4 ${message.read ? "bg-white" : "bg-sky-50/70"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {message.name}
                            </p>
                            {!message.read && (
                              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                Nuevo
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-slate-600">
                            <a
                              href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                              className="font-medium text-slate-800 hover:underline"
                            >
                              {message.email}
                            </a>
                            {" · "}
                            <span className="text-slate-500">
                              {fmt(message.createdAt)}
                            </span>
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {message.subject}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {message.message}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          {!message.read && (
                            <button
                              type="button"
                              onClick={() => markContactRead(message.id)}
                              className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50"
                            >
                              Marcar leído
                            </button>
                          )}
                          <a
                            href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}&body=${encodeURIComponent(`Hola ${message.name},\n\n`)}`}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Responder
                          </a>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          )}

          {tab === "donations" && (
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Donaciones
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    Intenciones registradas
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Lista de personas que iniciaron una donación desde el sitio.
                    Los montos reflejan lo declarado antes de ir a PayPal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportDonationsCsv}
                  disabled={filteredDonations.length === 0}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Exportar CSV
                </button>
              </div>

              <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
                <MetricCard
                  label="Total recaudado"
                  value={
                    donationsData
                      ? formatDonationUsd(donationsData.stats.totalCents)
                      : "—"
                  }
                  sub="Suma de montos declarados"
                  accent="#d97706"
                />
                <MetricCard
                  label="Donantes"
                  value={donationsData?.stats.count ?? "—"}
                  sub="Personas que iniciaron donación"
                />
                <MetricCard
                  label="Últimas 24 h"
                  value={
                    donationsData
                      ? `${donationsData.stats.last24hCount} · ${formatDonationUsd(donationsData.stats.last24hCents)}`
                      : "—"
                  }
                  sub="Cantidad y monto del último día"
                  accent="#9333ea"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-white text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nombre</th>
                      <th className="px-4 py-3 font-semibold">Monto</th>
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDonations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          {donationsData ? "Sin donaciones." : "Cargando donaciones…"}
                        </td>
                      </tr>
                    ) : (
                      filteredDonations.map((donation) => (
                        <tr key={donation.id} className="bg-white">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {donation.name}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDonationUsd(donation.amountCents)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {fmt(donation.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
