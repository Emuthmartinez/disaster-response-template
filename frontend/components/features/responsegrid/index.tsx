"use client";

import dynamic from "next/dynamic";

const ResponseGridHub = dynamic(() => import("./ResponseGridHub"), {
  ssr: false,
  loading: () => (
    <section className="e-m-loading-section">Cargando hub ResponseGrid…</section>
  ),
});

export default ResponseGridHub;
