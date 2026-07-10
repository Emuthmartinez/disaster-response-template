import type { Metadata } from "next";
import { Shell } from "../shell";
import { RolesAdmin } from "./roles-admin";
import { RequireAnyCapability } from "@/src/shared/auth/admin-gate";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function Page() {
  return (
    <Shell>
      <RequireAnyCapability
        caps={["role:read", "role:create"]}
        fallback={<p>No tienes permiso para administrar roles.</p>}
      >
        <RolesAdmin />
      </RequireAnyCapability>
    </Shell>
  );
}
