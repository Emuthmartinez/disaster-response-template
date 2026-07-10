import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "../shell";
import { ModelPage } from "./model-page";
import { getModel } from "../../src/contexts/models/model-registry";

export const metadata: Metadata = {
  robots: { index: false },
};

// Sin generateStaticParams a propósito: el contenido (Shell→AdminGate→sesión) es
// 100% client y los datos llegan vía React Query, así que pre-renderizar
// segmentos no aporta nada. La página queda dinámica; getModel valida el path.
export default async function Page({ params }: { params: Promise<{ model: string }> }) {
  const { model } = await params;
  const config = getModel(model);
  if (!config) notFound();

  return (
    <Shell>
      <ModelPage path={config.path} />
    </Shell>
  );
}
