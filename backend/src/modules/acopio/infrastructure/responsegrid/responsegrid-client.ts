import {
  ResponseGridHttp,
  ResponseGridHttpError,
  type ResponseGridHttpOptions,
} from "@/lib/responsegrid-http";
import { CollectionCenterProviderError } from "../../domain/collection-center-provider";

export const RESPONSEGRID_SOURCE = "responsegrid";

const RESPONSEGRID_MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 40;
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;

export interface ResponseGridLocation {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ResponseGridResource {
  id: string;
  type?: string | null;
  stage?: string | null;
  name?: string | null;
  description?: string | null;
  location?: ResponseGridLocation | null;
  verificationLevel?: string | null;
  publicStatus?: string | null;
  accepts?: unknown;
  contact?: string | null;
  schedule?: string | null;
  manager?: string | null;
  country?: string | null;
  city?: string | null;
  disputed?: boolean | null;
}

interface ResponseGridResourcesPage {
  items?: ResponseGridResource[];
  total?: number;
}

export interface ResponseGridClientOptions extends ResponseGridHttpOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly refreshTimeoutMs?: number;
}

export class ResponseGridClient extends ResponseGridHttp {
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly refreshTimeoutMs: number;

  constructor(options: ResponseGridClientOptions) {
    super(options);
    this.pageSize = options.pageSize ?? RESPONSEGRID_MAX_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.refreshTimeoutMs = options.refreshTimeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS;
  }

  async listAllResources(): Promise<ResponseGridResource[]> {
    try {
      const deadline = Date.now() + this.refreshTimeoutMs;
      const emergencyId = await this.resolveEmergencyId();
      const resources: ResponseGridResource[] = [];
      for (let page = 1; page <= this.maxPages; page++) {
        if (Date.now() >= deadline) {
          throw new ResponseGridHttpError("La actualización de la fuente excedió su plazo.");
        }
        const responsePage = await this.fetchJson<ResponseGridResourcesPage>(
          `/emergencies/${emergencyId}/public/resources?page=${page}&limit=${this.pageSize}`,
        );
        const items = Array.isArray(responsePage.items) ? responsePage.items : [];
        resources.push(...items);
        const total = responsePage.total ?? resources.length;
        if (items.length < this.pageSize || resources.length >= total) break;
      }
      return resources;
    } catch (err) {
      if (err instanceof ResponseGridHttpError) {
        throw new CollectionCenterProviderError(err.message, RESPONSEGRID_SOURCE, err.cause);
      }
      throw err;
    }
  }
}
