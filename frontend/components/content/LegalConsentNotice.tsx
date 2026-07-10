import Link from "next/link";

/** Aviso breve de aceptación legal en formularios que recopilan datos. */
export default function LegalConsentNotice({
  className = "text-xs text-slate-500",
}: {
  className?: string;
}) {
  return (
    <p className={className}>
      Al enviar aceptas los{" "}
      <Link href="/terminos" className="font-semibold underline hover:text-slate-700">
        Términos y Condiciones
      </Link>{" "}
      y la{" "}
      <Link
        href="/privacidad"
        className="font-semibold underline hover:text-slate-700"
      >
        Política de Privacidad
      </Link>{" "}
      de Malla Net.
    </p>
  );
}
