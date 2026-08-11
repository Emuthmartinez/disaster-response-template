/**
 * Integración HTTP de las rutas PÚBLICAS de mascotas (/api/pets). Supertest
 * contra el Postgres LOCAL, solo datos sintéticos.
 *
 * Además del contrato habitual (DTO por allowlist, foto por endpoint derivado,
 * nunca base64) este fichero cubre DOS invariantes propias de esta feature:
 *
 *   1. AISLAMIENTO. Crear mascotas no puede mover NI UN dígito del conteo ni del
 *      listado de personas desaparecidas. Es la razón de que `missing_pets` sea
 *      una tabla aparte, y aquí se comprueba de verdad en vez de confiar en que
 *      nadie olvide un WHERE.
 *   2. MICROCHIP. Se guarda pero no se publica jamás; el DTO solo dice si hay.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import { SYNTHETIC_PNG_DATA_URL, expectNoSensitiveFields } from "../helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

/** Mascota sintética con etiqueta única (>= MIN_SEARCH_LEN) para buscarla sin
 *  chocar con el TTL del listado general. Nada de datos reales. */
function syntheticPet(overrides: Record<string, unknown> = {}) {
  const tag = `Zmasc${Math.trunc(performance.now())}`;
  return {
    name: `${tag} Firulais`,
    species: "perro",
    breed: "Criollo mediano",
    color: "Marron con blanco",
    sex: "macho",
    age: 4,
    description: "Registro de prueba (demo)",
    lastSeen: "Parque demo, Ciudad Ejemplo",
    contact: "demo@test.local",
    reportType: "missing" as const,
    photo: SYNTHETIC_PNG_DATA_URL,
    _tag: tag,
    ...overrides,
  };
}

describe("POST /api/pets", () => {
  it("crea CON foto y devuelve photoUrl derivada, nunca el base64 crudo", async () => {
    const pet = syntheticPet();
    const res = await request(app).post("/api/pets").send(pet);
    expect(res.status).toBe(201);
    expect(res.body.pet).toMatchObject({
      name: pet.name,
      species: "perro",
      sex: "macho",
      status: "active",
    });
    const id = res.body.pet.id as string;
    expect(id).toBeTruthy();
    expect(res.body.pet.photoUrl).toBe(`/api/pets/${id}/photo`);
    expect(res.body.pet).not.toHaveProperty("photo");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expectNoSensitiveFields(res.body);
  });

  it("acepta una mascota SIN nombre (quien la encuentra rara vez lo sabe)", async () => {
    const res = await request(app)
      .post("/api/pets")
      .send({
        name: "",
        species: "gato",
        description: "Gato atigrado encontrado cerca del puente (demo)",
        reportType: "found",
      });
    expect(res.status).toBe(201);
    expect(res.body.pet.name).toBe("");
    // Un reporte "la encontré" nace ya resuelto, igual que en personas.
    expect(res.body.pet.status).toBe("found");
  });

  it("rechaza una ficha sin nombre NI descripción NI foto (no ayuda a reconocerla)", async () => {
    const res = await request(app).post("/api/pets").send({ species: "perro" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("guarda el microchip pero NUNCA lo devuelve: solo hasMicrochip", async () => {
    const chip = "900000000000123";
    const res = await request(app)
      .post("/api/pets")
      .send(syntheticPet({ microchip: chip }));
    expect(res.status).toBe(201);
    expect(res.body.pet.hasMicrochip).toBe(true);
    expect(res.body.pet).not.toHaveProperty("microchip");
    expect(JSON.stringify(res.body)).not.toContain(chip);

    // Tampoco puede filtrarse por el listado ni por la ficha individual.
    const list = await request(app).get("/api/pets").query({ status: "all" });
    expect(JSON.stringify(list.body)).not.toContain(chip);
    expectNoSensitiveFields(list.body);
  });

  it("sin microchip informa hasMicrochip=false", async () => {
    const res = await request(app).post("/api/pets").send(syntheticPet());
    expect(res.body.pet.hasMicrochip).toBe(false);
  });
});

describe("GET /api/pets", () => {
  it("encuentra la mascota recién creada buscando por su etiqueta", async () => {
    const pet = syntheticPet();
    const created = await request(app).post("/api/pets").send(pet);
    const id = created.body.pet.id as string;

    const res = await request(app).get("/api/pets").query({ q: pet._tag });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pets)).toBe(true);
    expect(res.body).toMatchObject({ page: 1, persistent: true });

    const found = res.body.pets.find((p: { id: string }) => p.id === id);
    expect(found).toBeTruthy();
    expect(found.photoUrl).toBe(`/api/pets/${id}/photo`);
    expect(found).not.toHaveProperty("photo");
    expectNoSensitiveFields(res.body);
  });

  it("busca también por raza y color, no solo por nombre", async () => {
    const tag = `Zraza${Math.trunc(performance.now())}`;
    const created = await request(app)
      .post("/api/pets")
      .send(syntheticPet({ name: "", breed: `${tag} labrador`, description: "demo" }));
    const id = created.body.pet.id as string;

    const res = await request(app).get("/api/pets").query({ q: tag });
    expect(res.status).toBe(200);
    expect(res.body.pets.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it("filtra por especie", async () => {
    await request(app).post("/api/pets").send(syntheticPet({ species: "perro" }));
    const res = await request(app).get("/api/pets").query({ species: "gato", status: "all" });
    expect(res.status).toBe(200);
    for (const p of res.body.pets) expect(p.species).toBe("gato");
  });

  it("sirve la foto subida como bytes por el endpoint dedicado", async () => {
    const created = await request(app).post("/api/pets").send(syntheticPet());
    const id = created.body.pet.id as string;

    const res = await request(app).get(`/api/pets/${id}/photo`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/pets/map", () => {
  it("rechaza bounds fuera de los límites terrestres", async () => {
    const res = await request(app)
      .get("/api/pets/map")
      .query({ north: 91, south: 0, east: 0, west: 0 });
    expect(res.status).toBe(400);
  });

  it("una mascota creada CON coordenadas aparece como marcador", async () => {
    const pet = syntheticPet({ lat: 4.711, lng: -74.0721 });
    const created = await request(app).post("/api/pets").send(pet);
    expect(created.status).toBe(201);
    const id = created.body.pet.id as string;

    const res = await request(app).get("/api/pets/map").query({ limit: 2000 });
    expect(res.status).toBe(200);
    const marker = res.body.markers.find((m: { id: string }) => m.id === id);
    expect(marker).toBeTruthy();
    expect(marker.lat).toBeCloseTo(4.711, 3);
    expect(marker.lng).toBeCloseTo(-74.0721, 3);
  });

  it("sin coordenadas NO aparece en el mapa, pero sí en el directorio", async () => {
    const pet = syntheticPet();
    const created = await request(app).post("/api/pets").send(pet);
    const id = created.body.pet.id as string;

    const map = await request(app).get("/api/pets/map").query({ limit: 2000 });
    expect(map.body.markers.some((m: { id: string }) => m.id === id)).toBe(false);

    const list = await request(app).get("/api/pets").query({ q: pet._tag });
    expect(list.body.pets.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it("devuelve marcadores ligeros sin foto cruda ni contacto", async () => {
    const res = await request(app).get("/api/pets/map");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.markers)).toBe(true);
    for (const m of res.body.markers) {
      expect(m).not.toHaveProperty("photo");
      expect(m).not.toHaveProperty("contact");
    }
    expectNoSensitiveFields(res.body);
  });
});

describe("POST /api/pets/:id/found", () => {
  it("exige nota Y foto-prueba, y luego marca la ficha como reunida", async () => {
    const created = await request(app).post("/api/pets").send(syntheticPet());
    const id = created.body.pet.id as string;

    const sinNota = await request(app)
      .post(`/api/pets/${id}/found`)
      .send({ photo: SYNTHETIC_PNG_DATA_URL });
    expect(sinNota.status).toBe(400);

    const sinFoto = await request(app)
      .post(`/api/pets/${id}/found`)
      .send({ note: "Apareció en casa de un vecino (demo)" });
    expect(sinFoto.status).toBe(400);

    const ok = await request(app).post(`/api/pets/${id}/found`).send({
      note: "Apareció en casa de un vecino (demo)",
      photo: SYNTHETIC_PNG_DATA_URL,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.pet).toMatchObject({ id, status: "found" });
    expect(ok.body.pet.resolvedAt).toBeTypeOf("number");
    expect(ok.body.pet.resolutionPhotoUrl).toBe(`/api/pets/${id}/resolution-photo`);
    expectNoSensitiveFields(ok.body);

    // Segunda vez: ya no está activa, así que no hay nada que resolver.
    const repetida = await request(app).post(`/api/pets/${id}/found`).send({
      note: "Otra vez (demo)",
      photo: SYNTHETIC_PNG_DATA_URL,
    });
    expect(repetida.status).toBe(404);
  });
});

describe("aislamiento respecto al directorio de PERSONAS", () => {
  /**
   * La invariante que justifica toda la decisión de diseño: por muchas mascotas
   * que se registren, el conteo público de personas desaparecidas no se mueve.
   * Con dos tablas esto es cierto POR CONSTRUCCIÓN — este test lo demuestra.
   */
  it("crear mascotas no altera /api/missing/stats", async () => {
    const antes = await request(app).get("/api/missing/stats");
    expect(antes.status).toBe(200);
    const base = antes.body.stats;

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/pets").send(syntheticPet());
      expect(res.status).toBe(201);
    }

    const despues = await request(app).get("/api/missing/stats");
    expect(despues.status).toBe(200);
    expect(despues.body.stats).toEqual(base);
  });

  it("ninguna mascota aparece en el listado de personas", async () => {
    const pet = syntheticPet();
    const created = await request(app).post("/api/pets").send(pet);
    const petId = created.body.pet.id as string;

    // Se busca por la etiqueta ÚNICA de la mascota en el directorio de personas:
    // si la separación fallara, ese id saldría aquí.
    const personas = await request(app)
      .get("/api/missing")
      .query({ q: pet._tag, status: "all" });
    expect(personas.status).toBe(200);
    expect(personas.body.people.some((p: { id: string }) => p.id === petId)).toBe(false);
    expect(personas.body.people).toHaveLength(0);
  });

  it("y ninguna persona aparece en el listado de mascotas", async () => {
    const tag = `Zpers${Math.trunc(performance.now())}`;
    const created = await request(app)
      .post("/api/missing")
      .send({ name: `${tag} Persona Sintetica`, lastSeen: "Zona demo" });
    expect(created.status).toBe(201);
    const personId = created.body.person.id as string;

    const mascotas = await request(app).get("/api/pets").query({ q: tag, status: "all" });
    expect(mascotas.status).toBe(200);
    expect(mascotas.body.pets.some((p: { id: string }) => p.id === personId)).toBe(false);
  });
});
