import type { Metadata } from "next";
import { Shell } from "../shell";
import { AuditAdmin } from "./audit-admin";
import { RequireCapability } from "@/src/shared/auth/admin-gate";

export const metadata: Metadata = {
  title: "Auditoría — Panel de administración",
  robots: { index: false },
};

export default function AuditPage() {
  return (
    <Shell>
      <RequireCapability cap="audit:read" fallback={<p>No tienes permiso (audit:read).</p>}>
        <AuditAdmin />
      </RequireCapability>
    </Shell>
  );
}
