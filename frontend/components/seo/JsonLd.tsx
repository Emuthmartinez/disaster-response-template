// Emite un bloque JSON-LD en el HTML del servidor (Server Component). Escapa
// "<" para no romper el documento ni permitir inyección. Reutilizable en layout
// y páginas para no repetir el patrón dangerouslySetInnerHTML.
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default JsonLd;
