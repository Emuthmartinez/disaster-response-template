import type { Metadata } from "next";
import { Shell } from "../shell";
import { RequireCapability } from "@/src/shared/auth/admin-gate";
import { PatientImportsAdmin } from "@/src/contexts/patient-imports/patient-imports-admin";

export const metadata: Metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Shell>
      <RequireCapability
        cap="patient:import"
        fallback={<p className="text-sm text-red-600">No tienes permiso (patient:import).</p>}
      >
        <PatientImportsAdmin />
      </RequireCapability>
    </Shell>
  );
}
