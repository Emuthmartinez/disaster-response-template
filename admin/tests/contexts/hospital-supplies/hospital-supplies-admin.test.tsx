import { HttpResponse, http } from "msw";
import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/tests/setup";
import { renderWithProviders } from "@/tests/_utils/render-with-providers";
import { HospitalSuppliesAdmin } from "@/src/contexts/hospital-supplies/hospital-supplies-admin";
import { AdminSessionContext } from "@/src/shared/auth/admin-session-context";
import type { SupplyBoard } from "@/src/contexts/hospital-supplies/types";

// Datos SINTÉTICOS (política del repo: nunca datos reales de crisis).
const board: SupplyBoard = {
  generatedAt: 1730000000000,
  stats: {
    hospitals: 1,
    redCategories: 1,
    yellowCategories: 0,
    staleCategories: 0,
    activeNeeds: 1,
    helpOpen: 1,
  },
  hospitals: [
    {
      hospital: {
        id: "hosp-demo-1",
        name: "DEMO Hospital Central",
        facilityType: "hospital",
        state: "Estado Demo",
        municipality: "Municipio Demo",
        priorityZone: "P0",
      },
      supply: {
        hospitalId: "hosp-demo-1",
        summary: {
          counts: { red: 1, yellow: 0, stale: 0, activeNeeds: 1 },
          worstStatus: "red",
          lastConfirmedAt: 1730000000000,
        },
        statuses: [
          {
            id: "st-1",
            hospitalId: "hosp-demo-1",
            category: "medications",
            status: "red",
            label: "Medicamentos",
            publicNote: "",
            restrictedNote: "nota interna demo",
            updatedBy: "demo@example.test",
            source: "admin_api",
            freshness: {
              lastUpdatedAt: 1730000000000,
              lastConfirmedAt: 1730000000000,
              staleAfterHours: 6,
              isStale: false,
              updatedAgo: "hace 1 h",
              confirmedAgo: "hace 1 h",
            },
          },
        ],
        activeNeeds: [
          {
            id: "need-1",
            hospitalId: "hosp-demo-1",
            category: "medications",
            categoryLabel: "Medicamentos",
            itemType: "Antibiótico demo",
            quantity: 10,
            unit: "cajas",
            urgency: "red",
            status: "active",
            publicNote: "",
            restrictedNote: "",
            updatedBy: "demo@example.test",
            source: "admin_api",
            updatedAgo: "hace 1 h",
          },
        ],
        helpRequests: [
          {
            id: "help-1",
            hospitalId: "hosp-demo-1",
            category: "water",
            categoryLabel: "Agua",
            message: "Se necesita apoyo logístico demo",
            urgency: "yellow",
            status: "open",
            requestedBy: "poc-demo",
            source: "hospital_poc",
            restrictedNote: "",
            updatedAgo: "hace 2 h",
          },
        ],
        pocs: [
          {
            id: "poc-1",
            displayName: "POC Demo",
            role: "hospital_poc",
            restrictedContact: "+00 000 000 (demo)",
            active: true,
          },
        ],
      },
    },
  ],
};

function renderWithSession(capabilities: string[]) {
  server.use(
    http.get("/api/admin/hospital-supplies", () => HttpResponse.json(board)),
    http.get("/api/admin/hospital-supplies/hosp-demo-1/events", () =>
      HttpResponse.json({
        items: [
          {
            id: "ev-1",
            category: "medications",
            entityType: "status",
            action: "status_update",
            actor: "demo@example.test",
            source: "admin_api",
            createdAt: 1730000000000,
          },
        ],
      }),
    ),
  );
  return renderWithProviders(
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
      <HospitalSuppliesAdmin />
    </AdminSessionContext.Provider>,
  );
}

describe("HospitalSuppliesAdmin", () => {
  it("muestra el board y el detalle con datos restringidos", async () => {
    renderWithSession(["hospital:read", "hospital:edit"]);

    expect(await screen.findByText("DEMO Hospital Central")).toBeInTheDocument();
    expect(screen.getByText("Necesidades activas")).toBeInTheDocument();

    fireEvent.click(screen.getByText("DEMO Hospital Central"));

    // "Medicamentos" aparece en la fila de semáforo Y en los <option> de los
    // forms — basta con que exista al menos una vez.
    expect((await screen.findAllByText("Medicamentos")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Antibiótico demo/)).toBeInTheDocument();
    expect(screen.getByText("Se necesita apoyo logístico demo")).toBeInTheDocument();
    expect(screen.getByText("POC Demo")).toBeInTheDocument();
    expect(screen.getByText(/nota interna demo/)).toBeInTheDocument();
    expect(await screen.findByText("status_update")).toBeInTheDocument();
    // Con hospital:edit se ven los forms de escritura.
    expect(screen.getByRole("button", { name: "Guardar semáforo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar necesidad" })).toBeInTheDocument();
  });

  it("conserva lo escrito cuando el server rechaza la escritura (regresión)", async () => {
    server.use(
      http.post("/api/admin/hospital-supplies/hosp-demo-1/status", () =>
        HttpResponse.json({ error: "Texto rechazado por seguridad." }, { status: 400 }),
      ),
    );
    renderWithSession(["hospital:read", "hospital:edit"]);
    fireEvent.click(await screen.findByText("DEMO Hospital Central"));

    // findAll* lanza si no hay ninguno, así que el primer elemento existe.
    const notaInterna = (await screen.findAllByLabelText("Nota interna (opcional)"))[0]!;
    fireEvent.change(notaInterna, { target: { value: "contacto interno importante" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar semáforo" }));

    expect(await screen.findByText("Texto rechazado por seguridad.")).toBeInTheDocument();
    // El texto NO se pierde: la persona puede corregir sin reescribir todo.
    expect(notaInterna).toHaveValue("contacto interno importante");
  });

  it("oculta los forms de escritura sin hospital:edit", async () => {
    renderWithSession(["hospital:read"]);

    fireEvent.click(await screen.findByText("DEMO Hospital Central"));

    expect(await screen.findByText(/Antibiótico demo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar semáforo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar necesidad" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar vigente" })).not.toBeInTheDocument();
  });
});
