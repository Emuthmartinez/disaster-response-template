import type { Metadata } from "next";
import { Shell } from "../shell";
import { RequireCapability } from "@/src/shared/auth/admin-gate";
import { GrantsAdmin } from "@/src/contexts/grants/grants-admin";

export const metadata: Metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Shell>
      <RequireCapability
        cap="grant:read"
        fallback={<p className="text-sm text-red-600">No tienes permiso (grant:read).</p>}
      >
        <GrantsAdmin />
      </RequireCapability>
    </Shell>
  );
}
