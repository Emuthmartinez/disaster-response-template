import type { ReactNode } from "react";
import { HttpResponse, http } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/tests/setup";
import { renderWithProviders } from "@/tests/_utils/render-with-providers";
import { PatientImportsAdmin } from "@/src/contexts/patient-imports/patient-imports-admin";
import { ImportRowsTable } from "@/src/contexts/patient-imports/import-rows-table";
import { AdminSessionContext } from "@/src/shared/auth/admin-session-context";

function withSession(ui: ReactNode) {
  const capabilities = ["patient:import"];
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
      {ui}
    </AdminSessionContext.Provider>,
  );
}

describe("PatientImportsAdmin — archivo", () => {
  it("sube un CSV como base64 con el contentType correcto", async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/admin/patient-imports", async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { import: { id: "imp-1", status: "queued", failedStage: null, errorSummary: null, counts: {} } },
          { status: 202 },
        );
      }),
      http.get("/api/admin/patient-imports/imp-1", () =>
        HttpResponse.json({
          import: { id: "imp-1", status: "queued", failedStage: null, errorSummary: null, counts: {} },
        }),
      ),
    );
    withSession(<PatientImportsAdmin />);

    const fileInput = screen.getByLabelText(/Archivo \(CSV o XLSX/);
    const csv = new File(["name,hospital\nDemo Uno,Hosp Demo\n"], "lote.csv", {
      type: "text/csv",
    });
    fireEvent.change(fileInput, { target: { files: [csv] } });
    fireEvent.click(screen.getByRole("button", { name: "Crear lote" }));

    await waitFor(() => expect(received).not.toBeNull());
    expect(received!.contentType).toBe("text/csv");
    expect(typeof received!.fileBase64).toBe("string");
    expect((received!.fileBase64 as string).length).toBeGreaterThan(0);
    expect(received!.rows).toBeUndefined();
  });

  it("muestra el botón de aplicar cuando el lote está processed", async () => {
    server.use(
      http.get("/api/admin/patient-imports/imp-2", () =>
        HttpResponse.json({
          import: {
            id: "imp-2",
            status: "processed",
            failedStage: null,
            errorSummary: null,
            counts: { total: 3, valid: 2, duplicate: 1 },
          },
        }),
      ),
      http.get("/api/admin/patient-imports/imp-2/rows", () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    withSession(<PatientImportsAdmin />);
    fireEvent.change(screen.getByLabelText(/ID del lote/), { target: { value: "imp-2" } });

    expect(await screen.findByText(/Procesado — revisa y aplica/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar filas válidas" })).toBeInTheDocument();
  });
});

describe("ImportRowsTable", () => {
  it("muestra estados, errores y candidatos de dedupe por fila", async () => {
    server.use(
      http.get("/api/admin/patient-imports/imp-3/rows", () =>
        HttpResponse.json({
          items: [
            {
              id: "r1",
              rowIndex: 0,
              name: "Demo Válida",
              age: 30,
              sourceHospital: "Hosp Demo",
              hospitalId: "h1",
              rowStatus: "valid",
              dedupStatus: "unique",
              validationErrors: [],
              validationWarnings: [],
              dedupCandidates: [],
              patientId: null,
            },
            {
              id: "r2",
              rowIndex: 1,
              name: "Demo Duplicada",
              age: 41,
              sourceHospital: "Hosp Demo",
              hospitalId: "h1",
              rowStatus: "duplicate",
              dedupStatus: "duplicate",
              validationErrors: [],
              validationWarnings: [],
              dedupCandidates: [
                { patientId: "p9", name: "Demo Original", reason: "document_hash exacto" },
              ],
              patientId: null,
            },
            {
              id: "r3",
              rowIndex: 2,
              name: null,
              age: null,
              sourceHospital: "Hospital Inexistente",
              hospitalId: null,
              rowStatus: "invalid",
              dedupStatus: "unknown",
              validationErrors: ["Falta el nombre."],
              validationWarnings: [],
              dedupCandidates: [],
              patientId: null,
            },
          ],
        }),
      ),
    );
    withSession(<ImportRowsTable importId="imp-3" />);

    expect(await screen.findByText("Demo Válida")).toBeInTheDocument();
    expect(screen.getByText("Válida")).toBeInTheDocument();
    expect(screen.getByText("Duplicada")).toBeInTheDocument();
    expect(screen.getByText(/Demo Original/)).toBeInTheDocument();
    expect(screen.getByText("Falta el nombre.")).toBeInTheDocument();
    expect(screen.getByText("Inválida")).toBeInTheDocument();
  });
});
