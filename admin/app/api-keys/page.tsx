import type { Metadata } from "next";
import { Shell } from "../shell";
import { ApiKeysAdmin } from "@/src/contexts/api-keys/api-keys-admin";
import { RequireCapability } from "@/src/shared/auth/admin-gate";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function Page() {
  return (
    <Shell>
      <RequireCapability cap="apikey:manage" fallback={<p>No tienes permiso (apikey:manage).</p>}>
        <ApiKeysAdmin />
      </RequireCapability>
    </Shell>
  );
}
