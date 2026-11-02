import { isAxiosError } from "axios";
import type { CreateCampaignInput } from "../../../api/campaigns.api";
import type { ApiErrorBody, CampaignTargetType } from "../../../api/types";
// ---------------------------------------------------------------------------
// Wizard form shape
// ---------------------------------------------------------------------------
// Local, string-friendly mirror of CreateCampaignInput. Numeric/datetime
// fields are kept as strings while being edited (so inputs can be empty
// without fighting `NaN`) and are coerced to the API shape only inside
// `buildPayload()`.
export interface WizardFormState {
  name: string;
  templateId: string;
  subjectOverride: string;
  targetType: CampaignTargetType;
  targetContactId: string;
  segmentIds: string[];
  tagIds: string[];
  smtpAccountIds: string[];
  useRotation: boolean;
  baseDelayMs: string;
  jitterMs: string;
  maxPerMinute: string;
  maxPerHour: string;
  maxRetries: string;
  scheduledAt: string;
}

export const EMPTY_FORM: WizardFormState = {
  name: "",
  templateId: "",
  subjectOverride: "",
  targetType: "SEGMENTS",
  targetContactId: "",
  segmentIds: [],
  tagIds: [],
  smtpAccountIds: [],
  useRotation: false,
  baseDelayMs: "3000",
  jitterMs: "2000",
  maxPerMinute: "",
  maxPerHour: "",
  maxRetries: "3",
  scheduledAt: "",
};

// Order matters: "Options d'envoi" (SMTP account selection) must come
// before "Pièces jointes" because saving the campaign for the first time
// (needed to attach files) requires smtpAccountIds to already be set —
// the backend's createCampaignSchema always requires at least one SMTP
// account. Putting attachments after SMTP selection means the campaign
// can always be auto-saved by the time the user reaches that step.
export const STEP_LABELS = [
  "Infos & modèle",
  "Destinataires",
  "Options d'envoi",
  "Pièces jointes",
  "Aperçu",
  "Récapitulatif",
];

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

// Mirrors createCampaignSchema/updateCampaignSchema exactly (backend/src/dto/campaign.dto.ts):
//  - smtpAccountIds must always have >= 1 entry
//  - targetContactId required when targetType === "SINGLE"
//  - segmentIds OR tagIds must be non-empty when targetType === "SEGMENTS"
//    (a Tag is itself a static "groupe de contacts" — selecting one directly
//    is an alternative to building a full Segment filter rule)
export function validateStep(step: number, form: WizardFormState): string[] {
  const errors: string[] = [];

  if (step === 0) {
    if (!form.name.trim()) errors.push("Le nom de la campagne est requis.");
  }

  if (step === 1) {
    if (form.targetType === "SINGLE" && !form.targetContactId) {
      errors.push("Veuillez sélectionner un contact.");
    }
    if (form.targetType === "SEGMENTS" && form.segmentIds.length === 0 && form.tagIds.length === 0) {
      errors.push("Veuillez sélectionner au moins un segment ou un groupe.");
    }
  }

  if (step === 2) {
    if (form.smtpAccountIds.length === 0) {
      errors.push("Veuillez sélectionner au moins un compte SMTP.");
    }
    const baseDelay = Number(form.baseDelayMs);
    if (form.baseDelayMs.trim() === "" || Number.isNaN(baseDelay) || baseDelay < 0) {
      errors.push("Le délai de base doit être un nombre positif.");
    }
    const jitter = Number(form.jitterMs);
    if (form.jitterMs.trim() === "" || Number.isNaN(jitter) || jitter < 0) {
      errors.push("La marge aléatoire doit être un nombre positif.");
    }
    if (form.maxPerMinute.trim() && (Number.isNaN(Number(form.maxPerMinute)) || Number(form.maxPerMinute) <= 0)) {
      errors.push("La limite par minute doit être un nombre positif.");
    }
    if (form.maxPerHour.trim() && (Number.isNaN(Number(form.maxPerHour)) || Number(form.maxPerHour) <= 0)) {
      errors.push("La limite par heure doit être un nombre positif.");
    }
    const maxRetries = Number(form.maxRetries);
    if (form.maxRetries.trim() === "" || Number.isNaN(maxRetries) || maxRetries < 0) {
      errors.push("Le nombre de tentatives doit être un nombre positif ou nul.");
    }
  }

  return errors;
}

export function buildPayload(form: WizardFormState): CreateCampaignInput {
  return {
    name: form.name.trim(),
    templateId: form.templateId || null,
    subjectOverride: form.subjectOverride.trim() ? form.subjectOverride.trim() : null,
    targetType: form.targetType,
    targetContactId: form.targetType === "SINGLE" ? form.targetContactId || null : null,
    segmentIds: form.targetType === "SEGMENTS" ? form.segmentIds : [],
    tagIds: form.targetType === "SEGMENTS" ? form.tagIds : [],
    smtpAccountIds: form.smtpAccountIds,
    useRotation: form.useRotation,
    baseDelayMs: Number(form.baseDelayMs) || 0,
    jitterMs: Number(form.jitterMs) || 0,
    maxPerMinute: form.maxPerMinute.trim() ? Number(form.maxPerMinute) : null,
    maxPerHour: form.maxPerHour.trim() ? Number(form.maxPerHour) : null,
    maxRetries: Number(form.maxRetries) || 0,
    // <input type="datetime-local"> yields "YYYY-MM-DDTHH:mm" (no timezone/seconds),
    // which fails zod's `.datetime()` check — append seconds + convert to a
    // full ISO instant via `new Date(...).toISOString()`.
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
  };
}

// Inverse of `new Date(datetimeLocalValue).toISOString()` above: converts a UTC
// ISO instant from the API back into the "YYYY-MM-DDTHH:mm" local wall-clock
// string a `datetime-local` input expects. Using `.slice(0, 16)` on the ISO
// string directly (the previous approach) would instead grab the raw UTC
// hour/minute, silently shifting the displayed time by the browser's UTC offset.
export function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}
