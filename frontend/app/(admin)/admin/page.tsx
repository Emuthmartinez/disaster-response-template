import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = pageMetadata({
  title: "Panel de administración",
  description: "Panel interno de coordinación. Acceso restringido.",
  path: "/admin",
  index: false,
});

export default function AdminPage() {
  return <AdminDashboard />;
}
