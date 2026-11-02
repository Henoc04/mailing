import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import * as campaignsApi from "../../api/campaigns.api";
import * as templatesApi from "../../api/templates.api";
import * as segmentsApi from "../../api/segments.api";
import * as smtpAccountsApi from "../../api/smtpAccounts.api";
import * as tagsApi from "../../api/tags.api";
import type { CampaignTargetType, ContactWithTags } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { Spinner } from "../../components/ui/Spinner";
import { LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";
import { ContactPicker } from "./wizard/ContactPicker";
import { TestSendPanel } from "./wizard/TestSendPanel";
import {
  EMPTY_FORM,
  STEP_LABELS,
  buildPayload,
  extractErrorMessage,
  toDatetimeLocalValue,
  validateStep,
  type WizardFormState,
} from "./wizard/wizardForm";

// Shared look for the scrollable checkbox lists (segments, tags, SMTP accounts).
const CHECK_LIST_CLASS =
  "max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1.5 dark:border-gray-800 dark:bg-gray-900";
const CHECK_ROW_CLASS =
  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50";

const TARGET_OPTIONS: { value: CampaignTargetType; label: string; icon: IconName }[] = [
  { value: "SINGLE", label: "Un seul contact", icon: "users" },
  { value: "SEGMENTS", label: "Segments / Groupes", icon: "funnel" },
  { value: "ALL", label: "Toute la base", icon: "inbox" },
];

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
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/30">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          {targetingPreviewQuery.isFetching ? (
            <>
              <Spinner className="h-4 w-4 text-brand-500" />
              Calcul des destinataires…
            </>
          ) : (
            <>
              <Icon name="users" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              {`${preview?.totalCount ?? 0} destinataire(s) correspondant(s)`}
            </>
          )}
        </p>
        {(preview?.contacts.length ?? 0) > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-gray-600 dark:text-gray-300">
            {preview!.contacts.map((c) => (
              <li key={c.id} className="break-words">
                {c.prenom} {c.nom} <span className="text-gray-400 dark:text-gray-500">—</span> {c.email}
              </li>
            ))}
          </ul>
        )}
        {preview && preview.totalCount > preview.contacts.length && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            et {preview.totalCount - preview.contacts.length} de plus…
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

  const header = (
    <PageHeader
      back={{ to: "/campaigns", label: "Campagnes" }}
      title={isEditMode ? "Modifier la campagne" : "Nouvelle campagne"}
      description="Configurez votre campagne en quelques étapes, puis lancez ou planifiez l'envoi."
    />
  );

  if (isEditMode && isLoadingCampaign) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState label="Chargement de la campagne…" />
      </div>
    );
  }

  const lastStep = STEP_LABELS.length - 1;

  const autoSavingNotice = (
    <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <Spinner className="h-4 w-4 text-brand-500" />
      Enregistrement automatique de la campagne en cours…
    </p>
  );

  return (
    <div className="space-y-6">
      {header}

      {/* Step indicator */}
      <nav aria-label="Étapes de la campagne" className="card py-3 sm:py-4">
        <ol className="flex items-center">
          {STEP_LABELS.map((label, index) => {
            const isCurrent = index === step;
            const isDone = index < step;
            return (
              <li key={label} className={clsx("flex items-center", index < lastStep && "flex-1")}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Étape ${index + 1} : ${label}`}
                  title={label}
                  className="group flex shrink-0 items-center gap-2 rounded-full"
                >
                  <span
                    className={clsx(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                      isCurrent &&
                        "bg-brand-600 text-white shadow-sm ring-4 ring-brand-500/20 dark:bg-brand-500 dark:ring-brand-400/20",
                      isDone &&
                        "bg-brand-50 text-brand-600 ring-1 ring-brand-200 group-hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/30",
                      !isCurrent &&
                        !isDone &&
                        "bg-white text-gray-500 ring-1 ring-gray-200 group-hover:ring-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700"
                    )}
                  >
                    {isDone ? <Icon name="check" className="h-4 w-4" /> : index + 1}
                  </span>
                  <span
                    className={clsx(
                      "whitespace-nowrap text-sm font-medium",
                      isCurrent ? "hidden text-gray-900 dark:text-white sm:inline" : "hidden xl:inline",
                      isDone && "text-gray-700 dark:text-gray-300",
                      !isCurrent && !isDone && "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    {label}
                  </span>
                </button>
                {index < lastStep && (
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "mx-1.5 h-0.5 min-w-[0.5rem] flex-1 rounded-full sm:mx-3",
                      isDone ? "bg-brand-500 dark:bg-brand-400" : "bg-gray-200 dark:bg-gray-800"
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        {/* Phones only show circles in the row above: name the current step here. */}
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 sm:hidden">
          Étape {step + 1} sur {STEP_LABELS.length} ·{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">{STEP_LABELS[step]}</span>
        </p>
      </nav>

      {stepErrors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <Icon name="alert" className="mt-0.5 shrink-0" />
          <ul className="list-inside list-disc space-y-1">
            {stepErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="section-title hidden sm:block">{STEP_LABELS[step]}</h2>

        {/* ---------------- Step 1 — Infos & modèle ---------------- */}
        {step === 0 && (
          <div className="space-y-5">
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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
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

              <div className="min-w-0">
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
                  <p className="hint break-words">Sujet actuel du modèle : « {selectedTemplate.subject} »</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Step 2 — Destinataires ---------------- */}
        {step === 1 && (
          <div className="space-y-5">
            <div role="radiogroup" aria-label="Type de ciblage" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TARGET_OPTIONS.map((option) => {
                const selected = form.targetType === option.value;
                return (
                  <label
                    key={option.value}
                    className={clsx(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/60",
                      selected
                        ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-800/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      className="sr-only"
                      checked={selected}
                      onChange={() => updateForm("targetType", option.value)}
                    />
                    <span
                      className={clsx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        selected
                          ? "bg-brand-600 text-white dark:bg-brand-500"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      <Icon name={option.icon} className="h-4 w-4" />
                    </span>
                    {option.label}
                  </label>
                );
              })}
            </div>

            {form.targetType === "SINGLE" && (
              <ContactPicker
                selectedContactId={form.targetContactId}
                onSelect={(contact) => updateForm("targetContactId", contact.id)}
              />
            )}

            {form.targetType === "SEGMENTS" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="label">Segments</p>
                    <div className={CHECK_LIST_CLASS}>
                      {(segments ?? []).length === 0 ? (
                        <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun segment disponible.</p>
                      ) : (
                        (segments ?? []).map((segment) => {
                          const checked = form.segmentIds.includes(segment.id);
                          return (
                            <label key={segment.id} className={CHECK_ROW_CLASS}>
                              <input
                                type="checkbox"
                                className="shrink-0"
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
                              <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                                {segment.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="label">Groupes (tags)</p>
                    <div className={CHECK_LIST_CLASS}>
                      {(tags ?? []).length === 0 ? (
                        <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun groupe disponible.</p>
                      ) : (
                        (tags ?? []).map((tag) => {
                          const checked = form.tagIds.includes(tag.id);
                          return (
                            <label key={tag.id} className={CHECK_ROW_CLASS}>
                              <input
                                type="checkbox"
                                className="shrink-0"
                                checked={checked}
                                onChange={() =>
                                  updateForm(
                                    "tagIds",
                                    checked ? form.tagIds.filter((tid) => tid !== tag.id) : [...form.tagIds, tag.id]
                                  )
                                }
                              />
                              <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">{tag.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
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
                <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                  <Icon name="info" className="mt-0.5 shrink-0" />
                  Tous les contacts non désabonnés recevront cet email.
                </div>
                {renderRecipientsPreview()}
              </div>
            )}
          </div>
        )}

        {/* ---------------- Step 4 — Pièces jointes ---------------- */}
        {step === 3 && (
          <div className="space-y-5">
            {!campaignId ? (
              autoSavingNotice
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
                    className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-500/10 dark:file:text-brand-300"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length > 0) {
                        uploadMutation.mutate(files);
                      }
                      e.target.value = "";
                    }}
                  />
                  {uploadMutation.isPending && (
                    <p className="hint flex items-center gap-2">
                      <Spinner className="h-3.5 w-3.5 text-brand-500" />
                      Envoi en cours…
                    </p>
                  )}
                </div>

                {templateAttachments.length > 0 && (
                  <div>
                    <p className="label">Pièces jointes du modèle (envoyées automatiquement)</p>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                      {templateAttachments.map((attachment) => (
                        <li key={attachment.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <Icon name="lock" className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="min-w-0 flex-1 break-words text-gray-700 dark:text-gray-200">
                            {attachment.fileName}{" "}
                            <span className="whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                              ({Math.round(attachment.sizeBytes / 1024)} Ko)
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="label">Pièces jointes actuelles</p>
                  {attachments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      Aucune pièce jointe pour le moment.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                      {attachments.map((attachment) => (
                        <li key={attachment.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 break-words text-gray-700 dark:text-gray-200">
                            {attachment.fileName}{" "}
                            <span className="whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                              ({Math.round(attachment.sizeBytes / 1024)} Ko)
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                            aria-label={`Retirer ${attachment.fileName}`}
                            disabled={removeAttachmentMutation.isPending}
                            loading={
                              removeAttachmentMutation.isPending && removeAttachmentMutation.variables === attachment.id
                            }
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
          <div className="space-y-5">
            <div>
              <p className="label">Comptes SMTP (au moins un requis)</p>
              <div className={CHECK_LIST_CLASS}>
                {eligibleSmtpAccounts.length === 0 ? (
                  <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun compte SMTP configuré.</p>
                ) : (
                  eligibleSmtpAccounts.map((account) => {
                    const checked = form.smtpAccountIds.includes(account.id);
                    return (
                      <label key={account.id} className={CHECK_ROW_CLASS}>
                        <input
                          type="checkbox"
                          className="shrink-0"
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
                        <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                          {account.label}{" "}
                          <span className="text-gray-500 dark:text-gray-400">({account.fromEmail})</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <label
              className={clsx(
                "flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800",
                form.smtpAccountIds.length < 2 ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              )}
            >
              <input
                type="checkbox"
                disabled={form.smtpAccountIds.length < 2}
                checked={form.useRotation}
                onChange={(e) => updateForm("useRotation", e.target.checked)}
                className="mt-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-gray-700 dark:text-gray-200">
                Activer la rotation entre comptes SMTP{" "}
                {form.smtpAccountIds.length < 2 && (
                  <span className="text-gray-500 dark:text-gray-400">(sélectionnez au moins 2 comptes)</span>
                )}
              </span>
            </label>

            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="baseDelayMs">
                  Délai de base entre deux envois (ms)
                </label>
                <input
                  id="baseDelayMs"
                  inputMode="numeric"
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
                  inputMode="numeric"
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
                  inputMode="numeric"
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
                  inputMode="numeric"
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
                  inputMode="numeric"
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
                <p className="hint">Laisser vide pour un envoi immédiat après validation.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Step 5 — Aperçu ---------------- */}
        {step === 4 && (
          <div className="space-y-5">
            {!campaignId ? (
              autoSavingNotice
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
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!previewContact}
                  loading={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  {!previewMutation.isPending && <Icon name="mailOpen" className="h-4 w-4" />}
                  Voir l'aperçu
                </Button>

                {previewResult && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                      <p className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="text-gray-500 dark:text-gray-400">Sujet : </span>
                        {previewResult.subject}
                      </p>
                    </div>
                    {/* dangerouslySetInnerHTML is acceptable here — the backend's
                        render+sanitize pipeline is trusted to have already
                        stripped unsafe markup before this HTML reaches the client. */}
                    <div
                      className="max-h-[28rem] overflow-auto break-words bg-white p-4 dark:bg-gray-950"
                      dangerouslySetInnerHTML={{ __html: previewResult.bodyHtml }}
                    />
                  </div>
                )}

                <TestSendPanel campaignId={campaignId} contactId={previewContact?.id} />
              </>
            )}
          </div>
        )}

        {/* ---------------- Step 6 — Récapitulatif & lancement ---------------- */}
        {step === 5 && (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 sm:grid-cols-2">
              {(
                [
                  { label: "Nom", value: form.name || "—" },
                  { label: "Modèle", value: selectedTemplate?.name ?? "Aucun" },
                  {
                    label: "Ciblage",
                    value:
                      form.targetType === "SINGLE"
                        ? "Un seul contact"
                        : form.targetType === "SEGMENTS"
                        ? `${form.segmentIds.length} segment(s), ${form.tagIds.length} groupe(s)`
                        : "Toute la base",
                  },
                  {
                    label: "Comptes SMTP",
                    value: `${form.smtpAccountIds.length} sélectionné(s)${form.useRotation ? " (rotation activée)" : ""}`,
                  },
                  { label: "Délai / marge", value: `${form.baseDelayMs} ms ± ${form.jitterMs} ms` },
                  {
                    label: "Planification",
                    value: form.scheduledAt ? new Date(form.scheduledAt).toLocaleString("fr-FR") : "Envoi immédiat",
                  },
                ] as { label: string; value: string }[]
              ).map((item) => (
                <div key={item.label} className="min-w-0 bg-white px-4 py-3 dark:bg-gray-900">
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {item.label}
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/30 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                loading={resolveMutation.isPending}
                onClick={async () => {
                  const targetId = campaignId ?? (await handleFinalSave());
                  if (targetId) {
                    resolveMutation.mutate(targetId);
                  }
                }}
              >
                {!resolveMutation.isPending && <Icon name="users" className="h-4 w-4" />}
                Résoudre les destinataires
              </Button>
              {resolvedCount !== null && (
                <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <Icon name="checkCircle" className="h-4 w-4 text-emerald-500" />
                  {resolvedCount} destinataire(s) éligible(s)
                </span>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                loading={saveMutation.isPending}
                onClick={handleFinalSave}
              >
                {!saveMutation.isPending && <Icon name="draft" className="h-4 w-4" />}
                Enregistrer le brouillon
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={saveMutation.isPending}
                loading={startMutation.isPending}
                onClick={handleScheduleOrSend}
              >
                {!startMutation.isPending && <Icon name="send" className="h-4 w-4" />}
                {startMutation.isPending ? "Démarrage…" : form.scheduledAt ? "Planifier" : "Envoyer maintenant"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Step navigation — sticky at the bottom of the screen on phones. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-gray-200/80 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/85 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:dark:bg-transparent">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={goBack}>
          <Icon name="chevronLeft" className="h-4 w-4" />
          Précédent
        </Button>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:hidden">
          {step + 1}/{STEP_LABELS.length}
        </span>
        {step < lastStep && (
          <Button type="button" onClick={goNext}>
            Suivant
            <Icon name="chevronRight" className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
