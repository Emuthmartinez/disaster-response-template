import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import PublishNeedForm from "@/components/features/needs/PublishNeedForm";

export const metadata: Metadata = pageMetadata({
  title: "Publicar una necesidad",
  description:
    "Publica una necesidad de insumos para que organizaciones y voluntarios puedan ayudarte. Iniciativa ciudadana, independiente y no gubernamental.",
  path: "/publicar-necesidad",
});

export default function PublicarNecesidadPage() {
  return (
    <SubPageShell breadcrumb="Publicar necesidad">
      <PublishNeedForm />
    </SubPageShell>
  );
}
