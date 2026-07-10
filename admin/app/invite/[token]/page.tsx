import type { Metadata } from "next";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = {
  robots: { index: false },
};

// Página PÚBLICA (sin sesión): el invitado aterriza aquí desde el email para
// fijar su contraseña. No se envuelve en Shell/AdminGate.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <AcceptInvite token={token} />
    </main>
  );
}
