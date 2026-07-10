import { HttpResponse, http } from "msw";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/tests/setup";
import { renderWithProviders } from "@/tests/_utils/render-with-providers";
import { ModelTable } from "@/src/contexts/models/ui/model-table";
import { getModel } from "@/src/contexts/models/model-registry";
import { AdminSessionContext } from "@/src/shared/auth/admin-session-context";

const reports = getModel("reports")!;

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
