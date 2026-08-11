import { HttpResponse, http } from "msw";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/tests/setup";
import { renderWithProviders } from "@/tests/_utils/render-with-providers";
import { ModelTable } from "@/src/contexts/models/ui/model-table";
import { getModel } from "@/src/contexts/models/model-registry";
import { AdminSessionContext } from "@/src/shared/auth/admin-session-context";

const reports = getModel("reports")!;

describe("ModelTable — selector de hospital (select-model)", () => {
  it("el form de pacientes ofrece hospitales por nombre, no UUIDs", async () => {
    server.use(
      http.get("/api/models/patients", () => HttpResponse.json([])),
      http.get("/api/models/hospitals", () =>
        HttpResponse.json([
          { id: "h-1", name: "Hospital Demo Uno" },
          { id: "h-2", name: "Hospital Demo Dos" },
        ]),
      ),
    );
    const patients = getModel("patients")!;
    const capabilities = ["patient:read", "patient:create"];
    renderWithProviders(
      <AdminSessionContext.Provider
        value={{
          user: { id: "u", email: "demo@example.test", roleId: null, orgId: null, isAdmin: false },
          capabilities,
          isLoading: false,
          sessionCheckFailed: false,
          retrySessionCheck: () => {},
          login: vi.fn(),
          logout: vi.fn(),
          can: (capability) => capabilities.includes(capability),
        }}
      >
        <ModelTable model={patients} />
      </AdminSessionContext.Provider>,
    );

    const select = await screen.findByLabelText("Hospital");
    expect(select.tagName).toBe("SELECT");
    expect(await screen.findByRole("option", { name: "Hospital Demo Uno" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Hospital Demo Dos" })).toBeInTheDocument();
  });
});

describe("ModelTable operations", () => {
  it("solo muestra acciones concedidas por capacidad", async () => {
    server.use(
      http.get("/api/models/reports", () =>
        HttpResponse.json([{ id: "report-1", place: "Lugar Demo" }]),
      ),
    );
    const capabilities = ["report:read", "report:delete"];
    renderWithProviders(
      <AdminSessionContext.Provider
        value={{
          user: { id: "u", email: "demo@example.test", roleId: null, orgId: null, isAdmin: false },
          capabilities,
          isLoading: false,
          sessionCheckFailed: false,
          retrySessionCheck: () => {},
          login: vi.fn(),
          logout: vi.fn(),
          can: (capability) => capabilities.includes(capability),
        }}
      >
        <ModelTable model={reports} />
      </AdminSessionContext.Provider>,
    );

    expect(await screen.findByText("Lugar Demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear" })).not.toBeInTheDocument();
  });
});
