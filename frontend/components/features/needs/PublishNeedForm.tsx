"use client";

import { useState } from "react";
import {
  usePublishNeed,
  NEED_CATEGORIES,
  NEED_PRIORITIES,
  type NeedAuthorInput,
  type NeedCategory,
  type NeedPriority,
} from "@/hooks/needs";
import LegalConsentNotice from "@/components/content/LegalConsentNotice";
import { useTurnstile } from "@/hooks/useTurnstile";
import { ApiError } from "@/lib/api";
import { usePrivacyConsent } from "@/components/layout/PrivacyConsentGate";

/**
 * El módulo de needs/ResponseGrid está gateado en el backend por
 * ENABLE_RESPONSEGRID (ver server.ts, junto a /api/acopio): sin el flag la
 * ruta ni se monta (404 genérico de /api/*); con el flag activo pero sin
 * RESPONSEGRID_API_KEY responde 503. Tratamos ambos como "módulo no
 * disponible" en vez de un error transitorio, igual que
 * isModuleDisabledError en hooks/acopio.ts hace para ResponseGridHub /
 * CollectionCenters.
 */
function isNeedsModuleDisabledError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 503);
}

interface ItemRow {
  name: string;
  category: NeedCategory;
  quantity: string;
  unit: string;
}

function emptyItem(): ItemRow {
  return { name: "", category: "food", quantity: "1", unit: "" };
}

export default function PublishNeedForm() {
  const { ensureConsent } = usePrivacyConsent();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<NeedPriority>("high");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [description, setDescription] = useState("");
  const [wantsContact, setWantsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);

  const publishMutation = usePublishNeed();
  const submitting = publishMutation.isPending;
  const { mountRef: turnstileMount, getToken: turnstileGetToken } =
    useTurnstile();

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(index: number) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  function buildAuthor(): NeedAuthorInput | undefined {
    if (!wantsContact) return undefined;
    const author: NeedAuthorInput = {};
    if (contactName.trim()) author.name = contactName.trim();
    if (contactEmail.trim()) author.email = contactEmail.trim();
    if (contactPhone.trim()) author.phone = contactPhone.trim();
    return Object.keys(author).length ? author : undefined;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Consentimiento ANTES de enviar datos personales. Si la persona no acepta,
    // no se envia nada. Ver components/layout/PrivacyConsentGate.tsx.
    if (!(await ensureConsent())) return;
    setError(null);
    setSuccess(null);

    const turnstileToken = await turnstileGetToken();
    publishMutation.mutate(
      {
        title: title.trim(),
        priority,
        address: address.trim(),
        description: description.trim() || undefined,
        items: items.map((item) => ({
          name: item.name.trim(),
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
          unit: item.unit.trim() || undefined,
          category: item.category,
        })),
        author: buildAuthor(),
        turnstileToken,
      },
      {
        onSuccess: () => {
          setSuccess(
            "Tu necesidad fue enviada y está en revisión. Aparecerá cuando el equipo de ResponseGrid la valide.",
          );
          setTitle("");
          setAddress("");
          setDescription("");
          setPriority("high");
          setItems([emptyItem()]);
          setWantsContact(false);
          setContactName("");
          setContactEmail("");
          setContactPhone("");
        },
        onError: (err) => {
          if (isNeedsModuleDisabledError(err)) {
            setModuleDisabled(true);
            return;
          }
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo publicar la necesidad.",
          );
        },
      },
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="e-card rounded-[24px] bg-white p-6 sm:p-10">
        <h1 className="mb-2 text-[22px] font-bold text-slate-900 sm:text-2xl">
          Publicar una necesidad
        </h1>
        <p className="mb-8 text-sm text-slate-600 sm:text-[15px]">
          Indica qué insumos necesitas y dónde. Tu solicitud se publica en
          ResponseGrid para que organizaciones y voluntarios puedan ayudarte;
          pasa por una revisión antes de hacerse pública.
        </p>

        {moduleDisabled ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Publicar necesidades no está disponible en este deployment.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="need-title"
                className="mb-2 block text-sm font-semibold text-slate-900"
              >
                ¿Qué necesitas? (título)
              </label>
              <input
                id="need-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                required
                placeholder="Ej. Agua y medicinas para refugio en Chacao"
                className="e-input w-full"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="need-priority"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Urgencia
                </label>
                <select
                  id="need-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as NeedPriority)}
                  className="e-input w-full"
                >
                  {NEED_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="need-address"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Dirección o zona
                </label>
                <input
                  id="need-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={200}
                  required
                  placeholder="Ej. Calle Principal 123, Barrio Ejemplo"
                  className="e-input w-full"
                />
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-slate-900">
                Artículos que necesitas
              </legend>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12 sm:items-end"
                >
                  <div className="sm:col-span-5">
                    <label
                      htmlFor={`item-name-${index}`}
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Artículo
                    </label>
                    <input
                      id={`item-name-${index}`}
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      maxLength={120}
                      required
                      placeholder="Ej. Agua potable"
                      className="e-input w-full"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label
                      htmlFor={`item-category-${index}`}
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Categoría
                    </label>
                    <select
                      id={`item-category-${index}`}
                      value={item.category}
                      onChange={(e) =>
                        updateItem(index, {
                          category: e.target.value as NeedCategory,
                        })
                      }
                      className="e-input w-full"
                    >
                      {NEED_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`item-qty-${index}`}
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Cantidad
                    </label>
                    <input
                      id={`item-qty-${index}`}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, { quantity: e.target.value })
                      }
                      className="e-input w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`item-unit-${index}`}
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Unidad
                    </label>
                    <input
                      id={`item-unit-${index}`}
                      type="text"
                      value={item.unit}
                      onChange={(e) => updateItem(index, { unit: e.target.value })}
                      maxLength={40}
                      placeholder="u, L, kg…"
                      className="e-input w-full"
                    />
                  </div>
                  {items.length > 1 && (
                    <div className="sm:col-span-12">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Quitar artículo
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="text-sm font-semibold e-m-link"
              >
                + Agregar otro artículo
              </button>
            </fieldset>

            <div>
              <label
                htmlFor="need-description"
                className="mb-2 block text-sm font-semibold text-slate-900"
              >
                Detalles (opcional)
              </label>
              <textarea
                id="need-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Contexto útil: número de personas, referencias del lugar, horarios…"
                className="e-input w-full resize-y"
              />
            </div>

            {/* Contacto opcional (privado, con consentimiento) */}
            <div className="rounded-xl border border-slate-200 p-4">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={wantsContact}
                  onChange={(e) => setWantsContact(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Quiero dejar un <strong>contacto</strong> para que coordinen la
                  ayuda. No se publica; se comparte con ResponseGrid solo para
                  contactarte.
                </span>
              </label>
              {wantsContact && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    maxLength={120}
                    placeholder="Nombre"
                    aria-label="Tu nombre"
                    className="e-input w-full"
                  />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    maxLength={160}
                    placeholder="Correo (opcional)"
                    aria-label="Tu correo"
                    className="e-input w-full"
                  />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    maxLength={40}
                    placeholder="Teléfono (opcional)"
                    aria-label="Tu teléfono"
                    className="e-input w-full"
                  />
                </div>
              )}
            </div>

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ El título, los artículos y los detalles son <strong>públicos</strong>:
              no pongas ahí teléfonos ni datos personales. Para que te contacten, usa
              el bloque de contacto de arriba.
            </p>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="e-m-alert-success">
                {success}
              </p>
            )}

            <div ref={turnstileMount} className="flex justify-center empty:hidden" />

            <LegalConsentNotice className="text-xs text-[var(--etext2)]" />

            <button
              type="submit"
              disabled={submitting}
              className="e-btn e-btn-primary w-full px-5 py-3 disabled:opacity-60"
            >
              {submitting ? "Publicando…" : "Publicar necesidad"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
