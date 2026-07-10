import { createNeedsRouter } from "./interface/http/needs-router";

export const needsRouter = createNeedsRouter();

// API interna para que otros módulos (reportes, hospitales) espejen necesidades.
export {
  publishNeedAtLocation,
  publishNeedByAddress,
  type MirrorNeedInput,
  type MirrorNeedByAddressInput,
} from "./needs-module";
export type { Priority, NeedCategory, NeedItem } from "./domain/need";
