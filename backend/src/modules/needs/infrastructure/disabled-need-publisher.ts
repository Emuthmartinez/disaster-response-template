import type { NeedPublisher } from "../domain/need-publisher";
import { NeedPublishingDisabledError } from "../domain/need-publisher";

/** Publisher inerte cuando no hay credencial de servicio: rechaza con un error claro. */
export class DisabledNeedPublisher implements NeedPublisher {
  async publish(): Promise<never> {
    throw new NeedPublishingDisabledError();
  }
}
