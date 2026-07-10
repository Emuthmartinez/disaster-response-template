import type { Metadata } from "next";
import { Shell } from "../shell";
import { UsersAdmin } from "./users-admin";
import { RequireAnyCapability } from "@/src/shared/auth/admin-gate";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function Page() {
  return (
    <Shell>
      <RequireAnyCapability
        caps={["user:read", "user:invite"]}
        fallback={<p>No tienes permiso para administrar usuarios.</p>}
      >
        <UsersAdmin />
      </RequireAnyCapability>
    </Shell>
  );
}
