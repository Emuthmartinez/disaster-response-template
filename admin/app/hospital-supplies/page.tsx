import type { Metadata } from "next";
import { Shell } from "../shell";
import { RequireCapability } from "@/src/shared/auth/admin-gate";
import { HospitalSuppliesAdmin } from "@/src/contexts/hospital-supplies/hospital-supplies-admin";

export const metadata: Metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Shell>
      <RequireCapability
        cap="hospital:read"
        fallback={<p className="text-sm text-red-600">No tienes permiso (hospital:read).</p>}
      >
        <HospitalSuppliesAdmin />
      </RequireCapability>
    </Shell>
  );
}
