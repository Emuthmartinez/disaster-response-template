import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serverApiGet, serverApiGetOrNull } from "@/lib/server-api";
import {
  buildHospitalSlug,
  FACILITY_TYPE_META,
  PRIORITY_ZONE_META,
  type Hospital,
  type HospitalPatient,
  type PublicHospitalSupplySummary,
} from "@/lib/hospitals-meta";
import HospitalDetailView from "@/components/features/hospitals/HospitalDetailView";
import SubPageShell from "@/components/layout/SubPageShell";
import { pageMetadata } from "@/lib/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, graph, ORG_ID } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { deploymentConfig } from "@/lib/deployment-config";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchHospital(id: string): Promise<Hospital | null> {
  const data = await serverApiGetOrNull<{ hospital: Hospital }>(
    `/api/hospitals/${id}`,
  );
  return data?.hospital ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const hospital = await fetchHospital(id);
  if (!hospital) {
    return pageMetadata({
      title: "Hospital no encontrado",
      description: "No encontramos el hospital solicitado.",
      index: false,
    });
  }
  return pageMetadata({
    title: `${hospital.name} · Hospitales`,
    description: `Información, pacientes registrados y datos del ${hospital.name} en ${hospital.state}. Iniciativa ciudadana, independiente y no gubernamental.`,
    path: `/hospitales/${buildHospitalSlug(hospital)}`,
  });
}

export default async function HospitalPage({ params }: PageProps) {
  const { id } = await params;
  const hospital = await fetchHospital(id);
  if (!hospital) notFound();
  const canonicalSlug = buildHospitalSlug(hospital);
  if (id !== canonicalSlug) redirect(`/hospitales/${canonicalSlug}`);

  const [patientsRes, supplyRes] = await Promise.all([
    serverApiGet<{ patients: HospitalPatient[] }>(
      `/api/hospitals/${hospital.id}/patients`,
    ),
    serverApiGet<{ supply: PublicHospitalSupplySummary | null }>(
      `/api/hospitals/${hospital.id}/supplies`,
    ),
  ]);
  const patients = patientsRes.patients ?? [];
  const supply = supplyRes.supply ?? undefined;
  const zone = PRIORITY_ZONE_META[hospital.priorityZone];
  const facility = FACILITY_TYPE_META[hospital.facilityType];

  const hospitalUrl = `${SITE_URL}/hospitales/${canonicalSlug}`;
  const hospitalJsonLd = {
    "@type": "Hospital",
    "@id": hospitalUrl,
    name: hospital.name,
    url: hospitalUrl,
    address: {
      "@type": "PostalAddress",
      ...(hospital.address ? { streetAddress: hospital.address } : {}),
      addressLocality: hospital.municipality || hospital.state,
      addressRegion: hospital.state,
    },
    areaServed: { "@type": "Place", name: deploymentConfig.regionLabel },
    provider: { "@id": ORG_ID },
  };
  const hospitalGraph = graph(
    hospitalJsonLd,
    breadcrumbSchema([
      { name: "Inicio", path: "/" },
      { name: "Hospitales", path: "/hospitales" },
      { name: hospital.name, path: `/hospitales/${canonicalSlug}` },
    ]),
  );

  return (
    <SubPageShell breadcrumb={hospital.name} path={`/hospitales/${canonicalSlug}`}>
      <JsonLd data={hospitalGraph} />

      <section
        className="border-b border-[var(--eborder)]"
        style={{
          background: `linear-gradient(180deg, ${zone.color}18, transparent)`,
        }}
      >
        <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
          <Link
            href="/hospitales"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-blue)] hover:underline"
          >
            ← Todos los hospitales
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ background: zone.color }}
            >
              {zone.emoji} {hospital.priorityZone} · {zone.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--eborder)] bg-[var(--esurf)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--etext2)]">
              {facility.emoji} {facility.label}
            </span>
            {hospital.level && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--eborder)] bg-[var(--esurf)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--etext2)]">
                Nivel {hospital.level}
              </span>
            )}
          </div>

          <h1 className="mt-3 text-balance text-2xl font-black tracking-tight text-[var(--etext)] sm:text-3xl">
            {hospital.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--etext2)]">
            {hospital.state}
            {hospital.municipality && ` · ${hospital.municipality}`}
          </p>
          {hospital.address && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--etext2)]">
              📍 {hospital.address}
            </p>
          )}

          <div className="mt-5 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Hospitalizados"
              value={hospital.activePatients}
              accent="#1d4ed8"
            />
            <Stat
              label="Total pacientes"
              value={hospital.totalPatients}
              accent="var(--etext)"
            />
            <Stat label="Zona" value={zone.label} accent={zone.color} />
          </div>
        </div>
      </section>

      <div className="e-hospital-detail mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
        <HospitalDetailView
          hospital={hospital}
          initialPatients={patients}
          initialSupply={supply}
        />

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">⚠️ Importante</p>
          <p className="mt-1 leading-relaxed">
            Los datos de pacientes son reportes ciudadanos no verificados. Sirven
            para ayudar a familiares a localizar a sus seres queridos. Si vas a
            registrar a alguien, confirma que cuentas con su autorización o la de
            un familiar directo. Si encuentras información incorrecta o
            desactualizada, contáctanos.
          </p>
        </div>
      </div>
    </SubPageShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--eborder)] bg-[var(--esurf)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--etext2)]">
        {label}
      </p>
      <p
        className="mt-0.5 truncate text-base font-bold sm:text-lg"
        style={{ color: accent }}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}
