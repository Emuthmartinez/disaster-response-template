/**
 * Tests de AdminGate — el gate distingue "no logueado" (login form) de
 * "no se pudo verificar la sesión" (aviso + reintentar). Mostrar el login
 * durante un blip del backend hacía creer que la sesión se había perdido.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminGate } from "@/src/shared/auth/admin-gate";
import {
  AdminSessionContext,
  type AdminSessionValue,
} from "@/src/shared/auth/admin-session-context";

function sessionValue(overrides: Partial<AdminSessionValue>): AdminSessionValue {
  return {
    user: null,
    capabilities: [],
    isLoading: false,
    sessionCheckFailed: false,
    retrySessionCheck: () => {},
    login: async () => {},
    logout: async () => {},
    can: () => false,
    ...overrides,
  };
}

function renderGate(value: AdminSessionValue) {
  return render(
    <AdminSessionContext.Provider value={value}>
      <AdminGate>
        <p>contenido protegido</p>
      </AdminGate>
    </AdminSessionContext.Provider>,
  );
}

describe("AdminGate", () => {
  it("resolviendo /me muestra el placeholder", () => {
    renderGate(sessionValue({ isLoading: true }));
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("fallo de verificación muestra reintentar, NO el login", async () => {
    const retry = vi.fn();
    renderGate(sessionValue({ sessionCheckFailed: true, retrySessionCheck: retry }));

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar la sesión");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("sin sesión (401 limpio) muestra el login", () => {
    renderGate(sessionValue({}));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("autenticado renderiza children", () => {
    renderGate(
      sessionValue({
        user: { id: "u1", email: "a@b.co", roleId: null, orgId: null, isAdmin: true },
      }),
    );
    expect(screen.getByText("contenido protegido")).toBeInTheDocument();
  });
});
