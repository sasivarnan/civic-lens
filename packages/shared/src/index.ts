import { z } from "zod";
export const categories = ["pedestrian", "accessibility", "pothole"] as const;
export const categoryLabels = {
  pedestrian: "Pedestrian safety",
  accessibility: "Accessibility barrier",
  pothole: "Pothole",
};
export const statuses = [
  "reported",
  "resolution_reported",
  "reopened",
] as const;
const bounds = { south: 12.7, north: 13.3, west: 77.2, east: 77.95 };
export const locationSchema = z.object({
  latitude: z.number().finite().min(bounds.south).max(bounds.north),
  longitude: z.number().finite().min(bounds.west).max(bounds.east),
  source: z.enum(["photo_gps", "device", "map", "coordinates"]),
  confirmed: z.literal(true),
});
export const analysisSchema = z.object({
  category: z.enum(categories),
  observations: z.array(z.string().max(500)).max(8),
  claims: z.array(z.string().max(500)).max(8),
  conflicts: z.array(z.string().max(500)).max(8),
  unknowns: z.array(z.string().max(500)).max(8),
  nextEvidence: z.string().max(700),
});
export type Analysis = z.infer<typeof analysisSchema>;
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const observationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const timestamp = Date.parse(v);
    return (
      Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === v &&
      v <= today()
    );
  }, "Use a valid observation date that is not in the future.");
export const reportSchema = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(10).max(3000),
  category: z.enum(categories),
  observationDate: observationDateSchema,
  location: locationSchema,
  analyzedDescription: z.string().trim().min(10).max(3000),
  receipt: z.string().max(16000),
  imageApproved: z.literal(true),
  finalApproved: z.literal(true),
});
export type ReportInput = z.infer<typeof reportSchema>;
export type Issue = {
  id: string;
  title: string;
  description: string;
  category: (typeof categories)[number];
  status: (typeof statuses)[number];
  latitude: number;
  longitude: number;
  observationDate: string;
  createdAt: string;
  demo: boolean;
  assetId: string | null;
  supportCount: number;
  confirmationCount: number;
  analysis?: Analysis;
  history?: Evidence[];
  guide?: Guide;
  reaction?: {
    support: boolean;
    confirmationDate: string | null;
    revision: number;
  };
};
type Evidence = {
  id: string;
  description: string;
  observationDate: string;
  createdAt: string;
  assetId: string | null;
  analysis: Analysis | null;
  kind?: string;
};
export type Guide = {
  title: string;
  steps: string[];
  source: string;
  reviewedAt: string;
  limitation: string;
};
export const guides: Record<(typeof categories)[number], Guide> = {
  pedestrian: {
    title: "Report a footpath or crossing problem",
    steps: [
      "Review the photo, incident point, and observation date.",
      "Save this report as a PDF for your records.",
      "Open the official GBA website and find Sahaaya 2.0 (Public Grievance). Follow its current instructions.",
      "Keep any acknowledgement for your own follow-up.",
    ],
    source: "https://gba.karnataka.gov.in/",
    reviewedAt: "2026-10-15",
    limitation:
      "CivicLens does not submit a government complaint. Road ownership, complaint categories, PDF acceptance, and response time are not confirmed.",
  },
  accessibility: {
    title: "Report an accessibility barrier",
    steps: [
      "Describe the observed barrier and the access difficulty.",
      "Save the approved evidence and incident location.",
      "Open the DEPwD Sugamya Bharat page. Follow the official app instructions.",
      "Keep any acknowledgement for your own follow-up.",
    ],
    source: "https://depwd.gov.in/en/document-category/sugamya-bharat-app/",
    reviewedAt: "2026-10-15",
    limitation:
      "The official FAQ covers buildings, transport, and ICT accessibility. Photos are recommended, not mandatory. This report does not establish legal noncompliance.",
  },
  pothole: {
    title: "Report damaged road surface",
    steps: [
      "Review the photo, incident point, and observation date.",
      "Describe visible damage without estimating depth from the photo.",
      "Open the official GBA website and find Sahaaya 2.0 (Public Grievance). Follow its current instructions.",
      "Keep any acknowledgement for your own follow-up.",
    ],
    source: "https://gba.karnataka.gov.in/",
    reviewedAt: "2026-10-15",
    limitation:
      "The service directory is confirmed. Detailed form steps and the responsible road agency remain unverified. No repair deadline or government action is promised.",
  },
};
