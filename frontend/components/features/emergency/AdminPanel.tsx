"use client";

import AdminLogin from "@/components/features/emergency/AdminLogin";

/** Botón de sesión admin (login/logout) para el header de la lista. */
export function AdminToggle({
  isAdmin,
  onLogout,
}: {
  isAdmin: boolean;
  onLogout: () => void;
}) {
  // No exponer la entrada al panel admin en la UI pública: el botón de login solo
  // tiene sentido para quien ya es admin (logout). El acceso inicial se hace por
  // los disparadores ocultos existentes (no por un botón visible "🔒 Admin").
  return isAdmin ? (
    <button
      type="button"
      onClick={onLogout}
      className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
      title="Cerrar sesión de administrador"
    >
      Admin ✓ · Salir
    </button>
  ) : null;
}

/** Modal de login admin. Solo se monta cuando `open`. */
export default function AdminPanel({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  onCancel: () => void;
  onSuccess: (token: string) => void;
}) {
  if (!open) return null;
  return <AdminLogin onCancel={onCancel} onSuccess={onSuccess} />;
}
