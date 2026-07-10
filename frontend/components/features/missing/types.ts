export type MissingReportType = "missing" | "found";
export type FoundPlace = "hospital" | "street";
export type PersonStatus = "safe" | "deceased";

export interface MissingPersonPayload {
  name: string;
  age: string;
  nationality: string;
  lastSeen: string;
  description: string;
  contact: string;
  photo: string | null;
  reportType: MissingReportType;
  turnstileToken?: string;
}
