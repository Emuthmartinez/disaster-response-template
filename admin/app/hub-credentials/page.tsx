import type { Metadata } from "next";
import { Shell } from "../shell";
import { HubCredentialsAdmin } from "@/src/contexts/hub-credentials/hub-credentials-admin";
import { RequireCapability } from "@/src/shared/auth/admin-gate";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function Page() {
  return (
    <Shell>
      <RequireCapability cap="mirror:manage" fallback={<p>No tienes permiso (mirror:manage).</p>}>
        <HubCredentialsAdmin />
      </RequireCapability>
    </Shell>
  );
}
