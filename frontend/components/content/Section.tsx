/**
 * Sección tipografiada para páginas de contenido legal (términos, privacidad).
 * Extraída del duplicado entre terminos/page.tsx y PrivacyPolicyBody.tsx.
 */
export default function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-8 scroll-mt-24 space-y-3 text-[15px] leading-relaxed text-slate-800"
    >
      <h2 className="text-xl font-bold tracking-tight text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  );
}
