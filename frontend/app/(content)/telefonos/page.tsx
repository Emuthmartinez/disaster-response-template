import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import EmergencyContacts from "@/components/features/contacts/EmergencyContacts";
import { webPageSchema } from "@/lib/jsonld";

// `EmergencyContacts` se importa DIRECTAMENTE, sin next/dynamic, a proposito:
// es el contenido PRINCIPAL de esta ruta. Ver el comentario largo en
// app/(app)/hospitales/page.tsx.

const TELEFONOS_DESC =
  "Directorio actualizado de teléfonos para emergencias, salud, rescate y servicios públicos durante la emergencia.";

export const metadata: Metadata = pageMetadata({
  title: "Teléfonos de emergencia",
  description: TELEFONOS_DESC,
  path: "/telefonos",
});

export default function TelefonosPage() {
  return (
    <SubPageShell
      breadcrumb="Teléfonos de emergencia"
      path="/telefonos"
      extraSchema={[
        webPageSchema({
          path: "/telefonos",
          name: "Teléfonos de emergencia",
          description: TELEFONOS_DESC,
        }),
      ]}
    >
      <EmergencyContacts />
    </SubPageShell>
  );
}
