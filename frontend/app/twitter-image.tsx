import { deploymentConfig } from "@/lib/deployment-config";
import {
  createSocialPreviewImage,
  SOCIAL_IMAGE_SIZE,
  SOCIAL_IMAGE_TYPE,
} from "@/lib/social-preview";

export const size = SOCIAL_IMAGE_SIZE;
export const contentType = SOCIAL_IMAGE_TYPE;
export const alt = `${deploymentConfig.productName} · ${deploymentConfig.orgName} — mapa y reportes ciudadanos`;

export default async function TwitterImage() {
  return createSocialPreviewImage();
}
