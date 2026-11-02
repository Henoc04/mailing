import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import * as campaignsApi from "../../api/campaigns.api";
import type { CreateCampaignInput } from "../../api/campaigns.api";
import * as templatesApi from "../../api/templates.api";
import * as segmentsApi from "../../api/segments.api";
import * as smtpAccountsApi from "../../api/smtpAccounts.api";
import * as contactsApi from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { ApiErrorBody, CampaignTargetType, ContactWithTags } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/ToastProvider";

// ---------------------------------------------------------------------------
// Wizard form shape
// ---------------------------------------------------------------------------
// Local, string-friendly mirror of CreateCampaignInput. Numeric/datetime
// fields are kept as strings while being edited (so inputs can be empty
// without fighting `NaN`) and are coerced to the API shape only inside
// `buildPayload()`.
interface WizardFormState {
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

const EMPTY_FORM: WizardFormState = {
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
const STEP_LABELS = [
  "Infos & modèle",
  "Destinataires",
  "Options d'envoi",
  "Pièces jointes",
  "Aperçu",
  "Récapitulatif",
];

function extractErrorMessage(error: unknown, fallback: string): string {
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
function validateStep(step: number, form: WizardFormState): string[] {
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

function buildPayload(form: WizardFormState): CreateCampaignInput {
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
function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

// -----------------------------------------------------------------------
// Debounced searchable contact picker — reused for Step 2 (SINGLE target)
// and Step 5 (preview), each with its own independent search/selection.
// -----------------------------------------------------------------------
interface ContactPickerProps {
  selectedContactId: string;
  onSelect: (contact: ContactWithTags) => void;
}

function ContactPicker({ selectedContactId, onSelect }: ContactPickerProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", "picker", debouncedSearch],
    queryFn: () => contactsApi.list({ search: debouncedSearch || undefined, pageSize: 10 }),
  });

  const contacts = data?.items ?? [];

  return (
    <div className="space-y-2">
      <input
        className="input"
        placeholder="Rechercher un contact (nom, email...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Recherche...</p>
        ) : contacts.length === 0 ? (
          <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Aucun contact trouvé.</p>
        ) : (
          contacts.map((contact) => (
            <button
              type="button"
              key={contact.id}
              onClick={() => onSelect(contact)}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                selectedContactId === contact.id ? "bg-brand-50 dark:bg-brand-900/30" : ""
              }`}
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {contact.prenom} {contact.nom}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{contact.email}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function CampaignWizardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const isEditMode = !!id;
  // `campaignId` is the id of the campaign persisted so far. In edit mode
  // it's the route param immediately. In create mode it starts null and is
  // filled in the moment the campaign gets auto-saved as a DRAFT (see
  // `ensureCampaignSaved` below) — from that point on the wizard behaves
  // exactly like edit mode for the remainder of the session, using PUT
  // instead of POST for subsequent saves.
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardFormState>(EMPTY_FORM);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [previewContact, setPreviewContact] = useState<ContactWithTags | null>(null);
  const [previewResult, setPreviewResult] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [resolvedCount, setResolvedCount] = useState<number | null>(null);

  const { data: existingCampaign, isLoading: isLoadingCampaign } = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => campaignsApi.getOne(id as string),
    enabled: isEditMode,
  });

  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: segmentsApi.list });
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.list });

  // Live-resolves which contacts actually match the current targeting
  // selection — shared by Step 2 (Destinataires, shows the list/count) and
  // Step 5 (Aperçu, defaults the preview to the first matching contact).
  // Non-destructive: unlike resolveMutation/campaignsApi.resolveRecipients,
  // this never touches CampaignRecipient rows and needs no saved campaignId.
  const targetingSelection: campaignsApi.PreviewRecipientsInput = {
    targetType: form.targetType,
    targetContactId: form.targetType === "SINGLE" ? form.targetContactId || null : null,
    segmentIds: form.targetType === "SEGMENTS" ? form.segmentIds : [],
    tagIds: form.targetType === "SEGMENTS" ? form.tagIds : [],
  };

  const targetingPreviewQuery = useQuery({
    queryKey: ["campaign-recipients-preview", targetingSelection],
    queryFn: () => campaignsApi.previewRecipients(targetingSelection),
    enabled: form.targetType !== "SINGLE" || !!form.targetContactId,
  });
  const { data: smtpAccounts } = useQuery({ queryKey: ["smtp-accounts"], queryFn: smtpAccountsApi.list });

  // Hydrate the local form once the existing campaign has loaded (edit mode).
  useEffect(() => {
    if (existingCampaign) {
      setForm({
        name: existingCampaign.name,
        templateId: existingCampaign.templateId ?? "",
        subjectOverride: existingCampaign.subjectOverride ?? "",
        targetType: existingCampaign.targetType,
        targetContactId: existingCampaign.targetContactId ?? "",
        segmentIds: existingCampaign.segments?.map((s) => s.id) ?? [],
        tagIds: existingCampaign.tags?.map((t) => t.id) ?? [],
        smtpAccountIds: existingCampaign.smtpAccounts?.map((a) => a.id) ?? [],
        useRotation: existingCampaign.useRotation,
        baseDelayMs: String(existingCampaign.baseDelayMs),
        jitterMs: String(existingCampaign.jitterMs),
        maxPerMinute: existingCampaign.maxPerMinute != null ? String(existingCampaign.maxPerMinute) : "",
        maxPerHour: existingCampaign.maxPerHour != null ? String(existingCampaign.maxPerHour) : "",
        maxRetries: String(existingCampaign.maxRetries),
        scheduledAt: existingCampaign.scheduledAt ? toDatetimeLocalValue(existingCampaign.scheduledAt) : "",
      });
      setCampaignId(existingCampaign.id);
    }
  }, [existingCampaign]);

  const attachments = existingCampaign?.attachments ?? [];
  const templateAttachments = existingCampaign?.template?.attachments ?? [];

  // ---------------------------------------------------------------------
  // Save (create or update) — the single mutation backing both the
  // "auto-save as DRAFT" flow (Steps 3/5) and manual saves.
  // ---------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form);
      if (campaignId) {
        return campaignsApi.update(campaignId, payload);
      }
      return campaignsApi.create(payload);
    },
    onSuccess: (campaign) => {
      setCampaignId(campaign.id);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaign.id] });
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible d'enregistrer la campagne"), "error"),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => campaignsApi.uploadAttachments(campaignId as string, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      showToast("Pièce(s) jointe(s) envoyée(s)", "success");
    },
    onError: (error) => showToast(extractErrorMessage(error, "Échec de l'envoi de la pièce jointe"), "error"),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => campaignsApi.removeAttachment(campaignId as string, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      showToast("Pièce jointe supprimée", "success");
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de supprimer la pièce jointe"), "error"),
  });

  const previewMutation = useMutation({
    mutationFn: () => campaignsApi.preview(campaignId as string, previewContact!.id),
    onSuccess: (result) => setPreviewResult(result),
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de générer l'aperçu"), "error"),
  });

  const resolveMutation = useMutation({
    mutationFn: (targetId: string) => campaignsApi.resolveRecipients(targetId),
    onSuccess: (result) => {
      setResolvedCount(result.totalRecipients);
      showToast(`${result.totalRecipients} destinataire(s) résolu(s)`, "success");
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de résoudre les destinataires"), "error"),
  });

  const startMutation = useMutation({
    mutationFn: (targetId: string) => campaignsApi.start(targetId),
    onSuccess: (_result, targetId) => {
      showToast("Campagne démarrée", "success");
      navigate(`/campaigns/${targetId}/progress`);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de démarrer la campagne"), "error"),
  });

  // Auto-save-as-DRAFT flow (the trickiest data-flow decision on this page):
  // `campaigns.api.uploadAttachments`/`removeAttachment` and
  // `campaigns.api.preview` all require an existing campaign id, but a brand
  // new campaign in create mode has none until it's actually POSTed. Rather
  // than forcing a save at the end of Step 1 (before targeting/SMTP are
  // even chosen, which would violate the backend's own refinements —
  // smtpAccountIds needs >= 1 entry on every create), we defer the first
  // save until the user *reaches* Step 4 ("Pièces jointes") or Step 5
  // ("Aperçu") in create mode — both come AFTER Step 3 ("Options d'envoi"),
  // where SMTP accounts are chosen, so by the time a save is attempted the
  // payload can always satisfy the backend's requirements. At that moment
  // we run the full create-payload validation (mirroring validateStep for
  // every prior step); if it fails we show the errors inline and let the
  // user jump back rather than silently failing against the backend's 400.
  async function ensureCampaignSaved(): Promise<string | null> {
    if (campaignId) {
      return campaignId;
    }

    try {
      const savedId = await saveIfValid();
      if (!savedId) {
        showToast("Complétez les étapes 1, 2 et 3 avant de continuer.", "error");
      }
      return savedId;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!isEditMode && (step === 3 || step === 4)) {
      void ensureCampaignSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Defaults the "Aperçu" step to the first contact actually matching the
  // campaign's targeting, instead of requiring a manual pick before showing
  // anything. The ContactPicker below remains available to override this.
  useEffect(() => {
    if (step === 4 && !previewContact && targetingPreviewQuery.data?.contacts.length) {
      setPreviewContact(targetingPreviewQuery.data.contacts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetingPreviewQuery.data]);

  useEffect(() => {
    if (previewContact && campaignId && !previewResult) {
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewContact, campaignId]);

  function goNext() {
    const errors = validateStep(step, form);
    if (errors.length > 0) {
      setStepErrors(errors);
      return;
    }
    setStepErrors([]);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function goBack() {
    setStepErrors([]);
    setStep((s) => Math.max(s - 1, 0));
  }

  function updateForm<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Read-only recap of who the current SEGMENTS/ALL targeting selection
  // actually resolves to. Not shown for SINGLE — the ContactPicker there
  // already shows the one contact directly.
  function renderRecipientsPreview() {
    const preview = targetingPreviewQuery.data;
    return (
      <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {targetingPreviewQuery.isFetching
            ? "Calcul des destinataires..."
            : `${preview?.totalCount ?? 0} destinataire(s) correspondant(s)`}
        </p>
        {(preview?.contacts.length ?? 0) > 0 && (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-gray-600 dark:text-gray-300">
            {preview!.contacts.map((c) => (
              <li key={c.id}>
                {c.prenom} {c.nom} — {c.email}
              </li>
            ))}
          </ul>
        )}
        {preview && preview.totalCount > preview.contacts.length && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            et {preview.totalCount - preview.contacts.length} de plus...
          </p>
        )}
      </div>
    );
  }

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === form.templateId) ?? null,
    [templates, form.templateId]
  );

  const eligibleSmtpAccounts = smtpAccounts ?? [];

  async function saveIfValid(): Promise<string | null> {
    const errors = [0, 1, 2].flatMap((s) => validateStep(s, form));
    if (errors.length > 0) {
      setStepErrors(errors);
      showToast("Certaines informations sont incomplètes.", "error");
      return null;
    }
    const saved = await saveMutation.mutateAsync();
    return saved.id;
  }

  async function handleFinalSave(): Promise<string | null> {
    const savedId = await saveIfValid();
    if (savedId) {
      showToast("Brouillon enregistré", "success");
    }
    return savedId;
  }

  async function handleScheduleOrSend() {
    // Persist the latest form state first (also doubles as the first save
    // if the campaign doesn't exist yet — e.g. create mode, user jumped
    // straight to the last step). `saveIfValid` returns the id from the
    // awaited response directly, since `campaignId` state wouldn't be
    // visible in this closure until the next render.
    const savedId = await saveIfValid();
    if (!savedId) {
      return;
    }

    if (form.scheduledAt) {
      // Backend: create()/update() already sets status to SCHEDULED
      // whenever scheduledAt is present — nothing further to trigger here.
      // start() would immediately flip the campaign to SENDING regardless
      // of scheduledAt, which is NOT what "Planifier" should do, so for a
      // scheduled campaign we only persist and stop.
      showToast("Campagne planifiée", "success");
      navigate("/campaigns");
      return;
    }

    // No scheduledAt => immediate send. campaigns.api.start() transitions
    // DRAFT/SCHEDULED -> SENDING and resolves recipients itself if none
    // exist yet, so no separate resolve call is required here.
    startMutation.mutate(savedId);
  }

  if (isEditMode && isLoadingCampaign) {
    return <p className="text-gray-500 dark:text-gray-400">Chargement de la campagne...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {isEditMode ? "Modifier la campagne" : "Nouvelle campagne"}
      </h1>

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEP_LABELS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors ${
                index === step
                  ? "bg-brand-600 text-white"
                  : index < step
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
                {index + 1}
              </span>
              {label}
            </button>
            {index < STEP_LABELS.length - 1 && <span className="text-gray-300 dark:text-gray-600">—</span>}
          </li>
        ))}
      </ol>

      {stepErrors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          <ul className="list-inside list-disc space-y-1">
            {stepErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-4">
        {/* ---------------- Step 1 — Infos & modèle ---------------- */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="name">
                Nom de la campagne
              </label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                placeholder="Ex : Newsletter juillet 2026"
              />
            </div>

            <div>
              <label className="label" htmlFor="templateId">
                Modèle
              </label>
              <select
                id="templateId"
                className="input"
                value={form.templateId}
                onChange={(e) => updateForm("templateId", e.target.value)}
              >
                <option value="">— Aucun modèle —</option>
                {(templates ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} — {template.subject}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="subjectOverride">
                Sujet personnalisé (optionnel)
              </label>
              <input
                id="subjectOverride"
                className="input"
                value={form.subjectOverride}
                onChange={(e) => updateForm("subjectOverride", e.target.value)}
                placeholder="Laisser vide pour utiliser le sujet du modèle"
              />
              {selectedTemplate && !form.subjectOverride && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Sujet actuel du modèle : « {selectedTemplate.subject} »
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---------------- Step 2 — Destinataires ---------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "SINGLE", label: "Un seul contact" },
                  { value: "SEGMENTS", label: "Segments / Groupes" },
                  { value: "ALL", label: "Toute la base" },
                ] as { value: CampaignTargetType; label: string }[]
              ).map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    form.targetType === option.value
                      ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300"
                      : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="targetType"
                    className="sr-only"
                    checked={form.targetType === option.value}
                    onChange={() => updateForm("targetType", option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>

            {form.targetType === "SINGLE" && (
              <ContactPicker
                selectedContactId={form.targetContactId}
                onSelect={(contact) => updateForm("targetContactId", contact.id)}
              />
            )}

            {form.targetType === "SEGMENTS" && (
              <div className="space-y-2">
                <p className="label">Segments</p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                  {(segments ?? []).length === 0 ? (
                    <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun segment disponible.</p>
                  ) : (
                    (segments ?? []).map((segment) => {
                      const checked = form.segmentIds.includes(segment.id);
                      return (
                        <label
                          key={segment.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                            checked={checked}
                            onChange={() =>
                              updateForm(
                                "segmentIds",
                                checked
                                  ? form.segmentIds.filter((sid) => sid !== segment.id)
                                  : [...form.segmentIds, segment.id]
                              )
                            }
                          />
                          <span className="text-gray-700 dark:text-gray-200">{segment.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <p className="label">Groupes (tags)</p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                  {(tags ?? []).length === 0 ? (
                    <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun groupe disponible.</p>
                  ) : (
                    (tags ?? []).map((tag) => {
                      const checked = form.tagIds.includes(tag.id);
                      return (
                        <label
                          key={tag.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                            checked={checked}
                            onChange={() =>
                              updateForm(
                                "tagIds",
                                checked ? form.tagIds.filter((tid) => tid !== tag.id) : [...form.tagIds, tag.id]
                              )
                            }
                          />
                          <span className="text-gray-700 dark:text-gray-200">{tag.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Un groupe (tag) regroupe des contacts déjà associés à ce tag. Vous pouvez combiner segments et
                  groupes : la campagne cible l'union de tous les contacts sélectionnés.
                </p>

                {renderRecipientsPreview()}
              </div>
            )}

            {form.targetType === "ALL" && (
              <div className="space-y-4">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Tous les contacts non désabonnés recevront cet email.
                </div>
                {renderRecipientsPreview()}
              </div>
            )}
          </div>
        )}

        {/* ---------------- Step 4 — Pièces jointes ---------------- */}
        {step === 3 && (
          <div className="space-y-4">
            {!campaignId ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enregistrement automatique de la campagne en cours...
              </p>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="attachments">
                    Ajouter des fichiers
                  </label>
                  <input
                    id="attachments"
                    type="file"
                    multiple
                    className="input"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length > 0) {
                        uploadMutation.mutate(files);
                      }
                      e.target.value = "";
                    }}
                  />
                  {uploadMutation.isPending && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Envoi en cours...</p>
                  )}
                </div>

                {templateAttachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="label">Pièces jointes du modèle (envoyées automatiquement)</p>
                    <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                      {templateAttachments.map((attachment) => (
                        <li key={attachment.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-gray-700 dark:text-gray-200">
                            {attachment.fileName}{" "}
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({Math.round(attachment.sizeBytes / 1024)} Ko)
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="label">Pièces jointes actuelles</p>
                  {attachments.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Aucune pièce jointe pour le moment.</p>
                  ) : (
                    <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                      {attachments.map((attachment) => (
                        <li key={attachment.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-gray-700 dark:text-gray-200">
                            {attachment.fileName}{" "}
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({Math.round(attachment.sizeBytes / 1024)} Ko)
                            </span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={removeAttachmentMutation.isPending}
                            onClick={() => removeAttachmentMutation.mutate(attachment.id)}
                          >
                            Retirer
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------------- Step 3 — Options d'envoi ---------------- */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="label">Comptes SMTP (au moins un requis)</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                {eligibleSmtpAccounts.length === 0 ? (
                  <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun compte SMTP configuré.</p>
                ) : (
                  eligibleSmtpAccounts.map((account) => {
                    const checked = form.smtpAccountIds.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                          checked={checked}
                          onChange={() =>
                            updateForm(
                              "smtpAccountIds",
                              checked
                                ? form.smtpAccountIds.filter((sid) => sid !== account.id)
                                : [...form.smtpAccountIds, account.id]
                            )
                          }
                        />
                        <span className="text-gray-700 dark:text-gray-200">
                          {account.label} ({account.fromEmail})
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={form.smtpAccountIds.length < 2}
                checked={form.useRotation}
                onChange={(e) => updateForm("useRotation", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-200">
                Activer la rotation entre comptes SMTP {form.smtpAccountIds.length < 2 && "(sélectionnez au moins 2 comptes)"}
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="baseDelayMs">
                  Délai de base entre deux envois (ms)
                </label>
                <input
                  id="baseDelayMs"
                  className="input"
                  value={form.baseDelayMs}
                  onChange={(e) => updateForm("baseDelayMs", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="jitterMs">
                  Marge aléatoire ajoutée au délai (ms)
                </label>
                <input
                  id="jitterMs"
                  className="input"
                  value={form.jitterMs}
                  onChange={(e) => updateForm("jitterMs", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="maxPerMinute">
                  Limite par minute
                </label>
                <input
                  id="maxPerMinute"
                  className="input"
                  value={form.maxPerMinute}
                  onChange={(e) => updateForm("maxPerMinute", e.target.value)}
                  placeholder="Laisser vide = pas de limite"
                />
              </div>
              <div>
                <label className="label" htmlFor="maxPerHour">
                  Limite par heure
                </label>
                <input
                  id="maxPerHour"
                  className="input"
                  value={form.maxPerHour}
                  onChange={(e) => updateForm("maxPerHour", e.target.value)}
                  placeholder="Laisser vide = pas de limite"
                />
              </div>
              <div>
                <label className="label" htmlFor="maxRetries">
                  Nombre de tentatives max.
                </label>
                <input
                  id="maxRetries"
                  className="input"
                  value={form.maxRetries}
                  onChange={(e) => updateForm("maxRetries", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="scheduledAt">
                  Planifier l'envoi (optionnel)
                </label>
                <input
                  id="scheduledAt"
                  type="datetime-local"
                  className="input"
                  value={form.scheduledAt}
                  onChange={(e) => updateForm("scheduledAt", e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Laisser vide pour un envoi immédiat après validation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Step 5 — Aperçu ---------------- */}
        {step === 4 && (
          <div className="space-y-4">
            {!campaignId ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enregistrement automatique de la campagne en cours...
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Le premier contact correspondant à votre ciblage est utilisé automatiquement pour générer
                  l'aperçu (variables de fusion incluses). Vous pouvez en choisir un autre ci-dessous.
                </p>
                <ContactPicker
                  selectedContactId={previewContact?.id ?? ""}
                  onSelect={(contact) => {
                    setPreviewContact(contact);
                    setPreviewResult(null);
                  }}
                />
                <Button
                  disabled={!previewContact || previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? "Génération..." : "Voir l'aperçu"}
                </Button>

                {previewResult && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Sujet : {previewResult.subject}
                    </p>
                    {/* dangerouslySetInnerHTML is acceptable here — the backend's
                        render+sanitize pipeline is trusted to have already
                        stripped unsafe markup before this HTML reaches the client. */}
                    <div
                      className="max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950"
                      dangerouslySetInnerHTML={{ __html: previewResult.bodyHtml }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------------- Step 6 — Récapitulatif & lancement ---------------- */}
        {step === 5 && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Nom</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">{form.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Modèle</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">{selectedTemplate?.name ?? "Aucun"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Ciblage</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">
                  {form.targetType === "SINGLE" && "Un seul contact"}
                  {form.targetType === "SEGMENTS" &&
                    `${form.segmentIds.length} segment(s), ${form.tagIds.length} groupe(s)`}
                  {form.targetType === "ALL" && "Toute la base"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Comptes SMTP</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">
                  {form.smtpAccountIds.length} sélectionné(s) {form.useRotation && "(rotation activée)"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Délai / marge</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">
                  {form.baseDelayMs} ms ± {form.jitterMs} ms
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Planification</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">
                  {form.scheduledAt ? new Date(form.scheduledAt).toLocaleString("fr-FR") : "Envoi immédiat"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button
                variant="secondary"
                disabled={resolveMutation.isPending}
                onClick={async () => {
                  const targetId = campaignId ?? (await handleFinalSave());
                  if (targetId) {
                    resolveMutation.mutate(targetId);
                  }
                }}
              >
                {resolveMutation.isPending ? "Résolution..." : "Résoudre les destinataires"}
              </Button>
              {resolvedCount !== null && (
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {resolvedCount} destinataire(s) éligible(s)
                </span>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={saveMutation.isPending} onClick={handleFinalSave}>
                {saveMutation.isPending ? "Enregistrement..." : "Enregistrer le brouillon"}
              </Button>
              <Button
                disabled={saveMutation.isPending || startMutation.isPending}
                onClick={handleScheduleOrSend}
              >
                {startMutation.isPending
                  ? "Démarrage..."
                  : form.scheduledAt
                  ? "Planifier"
                  : "Envoyer maintenant"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Step navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={goBack}>
          Précédent
        </Button>
        {step < STEP_LABELS.length - 1 && <Button onClick={goNext}>Suivant</Button>}
      </div>
    </div>
  );
}
