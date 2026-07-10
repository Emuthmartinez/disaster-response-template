export type PublicStatus = "active" | "saturated" | "paused" | "closed";
export type VerificationLevel = "verified" | "official";
export type Category = string;

export interface GeoLocation {
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface CollectionCenter {
  readonly id: string;
  readonly name: string;
  readonly manager: string | null;
  readonly location: GeoLocation;
  readonly city: string | null;
  readonly country: string | null;
  readonly accepts: readonly Category[];
  readonly contact: string | null;
  readonly schedule: string | null;
  readonly status: PublicStatus;
  readonly verificationLevel: VerificationLevel;
  readonly disputed: boolean;
  readonly description: string | null;
}
