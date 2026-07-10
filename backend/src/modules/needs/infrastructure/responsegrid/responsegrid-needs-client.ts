import {
  ResponseGridHttp,
  ResponseGridHttpError,
  type ResponseGridHttpOptions,
} from "@/lib/responsegrid-http";
import { NeedPublishError } from "../../domain/need-publisher";

export interface ResponseGridNeedItemPayload {
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
}

export interface ResponseGridAuthorPayload {
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
  verified: boolean;
  source: string;
}

export interface ResponseGridNeedPayload {
  title: string;
  description?: string;
  priority: string;
  location: { address: string; latitude: number; longitude: number };
  items: ResponseGridNeedItemPayload[];
  author?: ResponseGridAuthorPayload;
}

interface ResponseGridCreatedNeed {
  id?: string;
  status?: string;
}

export interface ResponseGridNeedsClientOptions extends ResponseGridHttpOptions {
  readonly apiKey: string;
}

/**
 * Escribe necesidades en ResponseGrid: resuelve la emergencia por slug (vía el
 * transporte compartido) y crea la necesidad con la api-key del service account
 * (`x-api-key`). Envuelve los fallos de transporte como NeedPublishError.
 */
export class ResponseGridNeedsClient extends ResponseGridHttp {
  private readonly apiKey: string;

  constructor(options: ResponseGridNeedsClientOptions) {
    super(options);
    this.apiKey = options.apiKey;
  }

  async createNeed(
    payload: ResponseGridNeedPayload,
  ): Promise<{ id: string; status: string }> {
    try {
      const emergencyId = await this.resolveEmergencyId();
      const created = await this.fetchJson<ResponseGridCreatedNeed>(
        `/emergencies/${emergencyId}/needs`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": this.apiKey },
          body: JSON.stringify(payload),
        },
      );
      if (!created?.id) {
        throw new NeedPublishError("La fuente no devolvió la necesidad creada.");
      }
      return { id: created.id, status: created.status ?? "pending" };
    } catch (err) {
      if (err instanceof NeedPublishError) throw err;
      if (err instanceof ResponseGridHttpError) {
        throw new NeedPublishError(err.message, err.cause);
      }
      throw err;
    }
  }
}
