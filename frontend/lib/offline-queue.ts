"use client";

import type { ReportType } from "./types";

/**
 * Cola de reportes pendientes de envío, persistida en IndexedDB.
 *
 * Por qué IndexedDB y no localStorage: un reporte puede incluir una foto en
 * data URL de ~1.4 MB; varios reportes encolados superarían fácilmente la
 * cuota de localStorage (~5 MB) y bloquearían toda la cola. IndexedDB maneja
 * cadenas grandes sin problema y es asíncrono.
 *
 * Esta capa solo almacena; la lógica de envío y reintento vive en el cliente
 * (EmergencyApp), que reintenta al recuperar la conexión.
 */

export interface QueuedPayload {
  type: ReportType;
  lat: number;
  lng: number;
  place: string;
  affected: number;
  needs: string;
  photo: string | null;
}

export interface QueuedReport {
  localId: string;
  payload: QueuedPayload;
  createdAt: number;
}

const DB_NAME = "emergency-offline";
const DB_VERSION = 1;
const STORE = "pending-reports";

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB no disponible"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let request: IDBRequest<T> | void;
    try {
      request = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      const r = request as IDBRequest<T> | undefined;
      resolve(r ? r.result : undefined);
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
    tx.onabort = () => {
      reject(tx.error);
      db.close();
    };
  });
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** Guarda un reporte para enviarlo más tarde. Lanza si no hay IndexedDB. */
export async function enqueueReport(
  payload: QueuedPayload,
): Promise<QueuedReport> {
  if (!hasIndexedDb()) {
    throw new Error("Almacenamiento offline no disponible en este navegador.");
  }
  const item: QueuedReport = {
    localId: newLocalId(),
    payload,
    createdAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.add(item));
  return item;
}

/** Devuelve los reportes pendientes, del más antiguo al más reciente. */
export async function listPending(): Promise<QueuedReport[]> {
  if (!hasIndexedDb()) return [];
  const all = await withStore<QueuedReport[]>("readonly", (store) =>
    store.getAll(),
  );
  return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePending(localId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await withStore("readwrite", (store) => store.delete(localId));
}

export async function countPending(): Promise<number> {
  if (!hasIndexedDb()) return 0;
  const n = await withStore<number>("readonly", (store) => store.count());
  return n ?? 0;
}
