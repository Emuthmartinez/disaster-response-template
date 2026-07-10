import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

const EmergencyContacts = dynamic(
  () => import("@/components/features/contacts/EmergencyContacts"),
  {
    loading: () => (
      <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
        Cargando teléfonos…
      </section>
    ),
  },
);

export const metadata: Metadata = pageMetadata({
  title: "Teléfonos de emergencia",
  description:
    "Directorio actualizado de teléfonos para emergencias, salud, rescate y servicios públicos durante el terremoto.",
  path: "/telefonos",
});

export default function TelefonosPage() {
  return (
    <SubPageShell breadcrumb="Teléfonos de emergencia">
      <EmergencyContacts />
    </SubPageShell>
  );
}
