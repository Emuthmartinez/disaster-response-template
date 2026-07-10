import { redirect } from "next/navigation";

// La invitación se centralizó en /users. Esta ruta admin queda como redirect
// (compatibilidad). OJO: /invite/[token] (aceptación PÚBLICA) sigue intacta.
export default function Page() {
  redirect("/users");
}
