import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import * as templatesApi from "../../api/templates.api";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { LoadingState } from "../../components/ui/States";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/ToastProvider";

const VARIABLE_OPTIONS: { token: string; label: string }[] = [
  { token: "{{prenom}}", label: "Prénom" },
  { token: "{{nom}}", label: "Nom" },
  { token: "{{genre}}", label: "Genre" },
  { token: "{{entreprise}}", label: "Entreprise" },
  { token: "{{fonction}}", label: "Fonction" },
  { token: "{{adresse}}", label: "Adresse" },
  { token: "{{codePostal}}", label: "Code postal" },
  { token: "{{ville}}", label: "Ville" },
  { token: "{{departement}}", label: "Département" },
  { token: "{{region}}", label: "Région" },
  { token: "{{pays}}", label: "Pays" },
  { token: "{{siteWeb}}", label: "Site internet" },
  { token: "{{email}}", label: "Email" },
];

// Rich-text styling for the editor and the preview (the Tailwind typography
// plugin isn't installed, so `prose` alone would leave headings/lists unstyled).
const RICH_TEXT_CLASSES =
  "prose prose-sm max-w-none break-words text-sm leading-relaxed text-gray-800 dark:prose-invert dark:text-gray-200 " +
  "[&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold " +
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic dark:[&_blockquote]:border-gray-600 " +
  "[&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-400 " +
  "[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded " +
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-gray-700 " +
  "[&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_th]:border-gray-700 dark:[&_th]:bg-gray-800";

// Popovers anchor to the whole toolbar on phones (full width, never off-screen)
// and to their own button from `sm` up.
const POPOVER_CLASSES =
  "absolute inset-x-2 top-full z-20 mt-1 animate-pop-in rounded-xl border border-gray-200 bg-white p-2 shadow-lift dark:border-gray-700 dark:bg-gray-800 sm:inset-x-auto sm:left-0";

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}

function ToolbarButton({ onClick, active, disabled, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      className={`inline-flex h-8 min-w-[2rem] items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
          : "text-gray-700 hover:bg-gray-200/70 dark:text-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-700" aria-hidden="true" />;
}

function PopoverCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      aria-label="Fermer"
    >
      <Icon name="x" className="h-4 w-4" />
    </button>
  );
}

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("");

  function applyLink() {
    if (url.trim()) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    }
    onClose();
  }

  return (
    <div className={`${POPOVER_CLASSES} flex items-center gap-2`}>
      <input
        type="url"
        inputMode="url"
        autoFocus
        aria-label="Adresse du lien"
        className="input min-w-0 flex-1 sm:w-64 sm:flex-none"
        placeholder="https://exemple.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            applyLink();
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      />
      <Button type="button" size="sm" className="shrink-0" onClick={applyLink}>
        Insérer
      </Button>
      <PopoverCloseButton onClose={onClose} />
    </div>
  );
}

function ImagePopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { showToast } = useToast();

  function applyImage() {
    if (url.trim()) {
      editor.chain().focus().setImage({ src: url.trim() }).run();
    }
    onClose();
  }

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const { url: uploadedUrl } = await templatesApi.uploadImage(file);
      editor.chain().focus().setImage({ src: uploadedUrl }).run();
      onClose();
    } catch {
      showToast("Impossible d'envoyer l'image (formats acceptés : PNG, JPEG, GIF, WebP — 15 Mo max).", "error");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className={`${POPOVER_CLASSES} flex flex-col gap-2 sm:w-[30rem] sm:flex-row sm:items-center`}>
      <div className="flex items-center justify-between gap-2">
        <label
          className={`btn h-8 cursor-pointer bg-brand-600 px-3 text-xs text-white shadow-sm hover:bg-brand-500 ${
            isUploading ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {isUploading && <Spinner className="h-3.5 w-3.5" />}
          {isUploading ? "Envoi…" : "Depuis mon PC"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <span className="sm:hidden">
          <PopoverCloseButton onClose={onClose} />
        </span>
      </div>
      <span className="text-center text-xs text-gray-400 sm:text-left">ou</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="text"
          autoFocus
          aria-label="URL de l'image"
          className="input min-w-0 flex-1"
          placeholder="URL de l'image (https:// ou data:)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyImage();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <Button type="button" size="sm" className="shrink-0" onClick={applyImage}>
          Insérer
        </Button>
        <span className="hidden sm:inline-flex">
          <PopoverCloseButton onClose={onClose} />
        </span>
      </div>
    </div>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const [openPopover, setOpenPopover] = useState<"link" | "image" | "variables" | null>(null);

  function togglePopover(name: "link" | "image" | "variables") {
    setOpenPopover((prev) => (prev === name ? null : name));
  }

  function insertVariable(token: string) {
    editor.chain().focus().insertContent(token).run();
    setOpenPopover(null);
  }

  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      className="relative flex flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-gray-200 bg-gray-50 p-1.5 dark:border-gray-800 dark:bg-gray-800/50"
    >
      <ToolbarButton label="Gras" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">G</span>
      </ToolbarButton>
      <ToolbarButton label="Italique" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="font-serif italic">I</span>
      </ToolbarButton>
      {/* StarterKit provides Strike, not Underline (no @tiptap/extension-underline
          is in the installed dependency list), so this toggles strikethrough. */}
      <ToolbarButton label="Barré" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">B</span>
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        label="Titre 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        label="Titre 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="Titre 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        label="Liste à puces"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •≡
      </ToolbarButton>
      <ToolbarButton
        label="Liste numérotée"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1≡
      </ToolbarButton>
      <ToolbarButton
        label="Citation"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        "
      </ToolbarButton>

      <ToolbarDivider />

      <div className="sm:relative">
        <ToolbarButton label="Insérer un lien" active={editor.isActive("link")} onClick={() => togglePopover("link")}>
          🔗
        </ToolbarButton>
        {openPopover === "link" && <LinkPopover editor={editor} onClose={() => setOpenPopover(null)} />}
      </div>

      <div className="sm:relative">
        <ToolbarButton label="Insérer une image" onClick={() => togglePopover("image")}>
          🖼️
        </ToolbarButton>
        {openPopover === "image" && <ImagePopover editor={editor} onClose={() => setOpenPopover(null)} />}
      </div>

      <ToolbarButton
        label="Insérer un tableau"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        ⊞
      </ToolbarButton>

      <ToolbarDivider />

      <div className="sm:relative">
        <ToolbarButton
          label="Insérer une variable"
          active={openPopover === "variables"}
          onClick={() => togglePopover("variables")}
        >
          <span className="font-mono text-xs">{"{{ }}"}</span> Variables
          <Icon name="chevronDown" className="h-3.5 w-3.5" />
        </ToolbarButton>
        {openPopover === "variables" && (
          <div
            className={`${POPOVER_CLASSES} grid max-h-72 grid-cols-1 gap-0.5 overflow-y-auto p-1 min-[420px]:grid-cols-2 sm:w-[26rem]`}
          >
            {VARIABLE_OPTIONS.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => insertVariable(variable.token)}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <span className="truncate">{variable.label}</span>
                <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-gray-500">{variable.token}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [isDraft, setIsDraft] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor");

  const templateQuery = useQuery({
    queryKey: ["templates", id],
    queryFn: () => templatesApi.getOne(id as string),
    enabled: isEditMode,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "min-h-[320px] focus:outline-none sm:min-h-[420px]",
      },
    },
    onUpdate: () => setIsDirty(true),
  });

  useEffect(() => {
    if (templateQuery.data && editor) {
      setName(templateQuery.data.name);
      setSubject(templateQuery.data.subject);
      setIsDraft(templateQuery.data.isDraft);
      editor.commands.setContent(templateQuery.data.bodyHtml);
      setIsDirty(false);
    }
  }, [templateQuery.data, editor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const bodyHtml = editor?.getHTML() ?? "";
      const payload = { name: name.trim(), subject: subject.trim(), bodyHtml, isDraft };
      if (isEditMode && id) {
        return templatesApi.update(id, payload);
      }
      return templatesApi.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast(isEditMode ? "Modèle mis à jour." : "Modèle créé.", "success");
      setIsDirty(false);
      // A brand-new template has no id until this save completes — land on its
      // own edit page (rather than the list) so attachments can be added right away.
      navigate(isEditMode ? "/templates" : `/templates/${saved.id}`);
    },
    onError: () => showToast("Impossible d'enregistrer le modèle.", "error"),
  });

  const attachments = templateQuery.data?.attachments ?? [];

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => templatesApi.uploadAttachments(id as string, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", id] });
      showToast("Pièce(s) jointe(s) envoyée(s)", "success");
    },
    onError: () => showToast("Échec de l'envoi de la pièce jointe.", "error"),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => templatesApi.removeAttachment(id as string, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", id] });
      showToast("Pièce jointe supprimée", "success");
    },
    onError: () => showToast("Impossible de supprimer la pièce jointe.", "error"),
  });

  function handleSave() {
    if (!name.trim()) {
      showToast("Le nom du modèle est requis.", "error");
      return;
    }
    if (!subject.trim()) {
      showToast("L'objet du modèle est requis.", "error");
      return;
    }
    saveMutation.mutate();
  }

  function handleBack() {
    if (isDirty && !window.confirm("Abandonner les modifications non enregistrées ?")) {
      return;
    }
    navigate("/templates");
  }

  // The back link is a button (not PageHeader's `back` Link) so that the
  // unsaved-changes confirmation in handleBack still runs.
  const backButton = (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    >
      <Icon name="chevronLeft" className="h-4 w-4" />
      Modèles d'emails
    </button>
  );

  if (isEditMode && templateQuery.isLoading) {
    return (
      <div className="space-y-2">
        {backButton}
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {backButton}
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {isEditMode ? "Modifier le modèle" : "Nouveau modèle"}
              {isDirty && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  Non enregistré
                </span>
              )}
            </span>
          }
          description="Composez le contenu HTML de votre email, avec variables de personnalisation."
          actions={
            <>
              <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={handleBack}>
                Retour
              </Button>
              <Button type="button" className="flex-1 sm:flex-none" onClick={handleSave} loading={saveMutation.isPending}>
                {!saveMutation.isPending && <Icon name="check" className="h-4 w-4" />}
                Enregistrer
              </Button>
            </>
          }
        />
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="template-name" className="label">
              Nom du modèle
            </label>
            <input
              id="template-name"
              type="text"
              className="input"
              autoFocus={!isEditMode}
              placeholder="Ex : Newsletter mensuelle"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>
          <div>
            <label htmlFor="template-subject" className="label">
              Objet de l'email
            </label>
            <input
              id="template-subject"
              type="text"
              className="input"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>
        </div>

        <label
          htmlFor="template-is-draft"
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            id="template-is-draft"
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600"
            checked={isDraft}
            onChange={(e) => {
              setIsDraft(e.target.checked);
              setIsDirty(true);
            }}
          />
          Enregistrer comme brouillon
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card min-w-0 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Corps de l'email</h2>
            <div
              role="tablist"
              aria-label="Mode d'affichage"
              className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "editor"}
                onClick={() => setViewMode("editor")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "editor"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                }`}
              >
                Éditeur
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "preview"}
                onClick={() => setViewMode("preview")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "preview"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                }`}
              >
                Aperçu
              </button>
            </div>
          </div>

          {viewMode === "editor" && editor && (
            <div>
              <EditorToolbar editor={editor} />
              <div className="cursor-text rounded-b-xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 dark:border-gray-800 dark:bg-gray-900 sm:px-5 sm:py-4">
                <EditorContent editor={editor} className={`${RICH_TEXT_CLASSES} overflow-x-auto focus:outline-none`} />
              </div>
            </div>
          )}

          {viewMode === "preview" && (
            // Aperçu = the CURRENT, PRE-save editor content rendered directly in the
            // user's own browser (their own draft, not a shared/multi-tenant surface).
            // This is NOT yet the backend's sanitize-html pass — that only happens on
            // save/persist. Still safe here since it's local content in the author's
            // own session.
            <div className="min-h-[320px] overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:min-h-[420px] sm:px-5 sm:py-4">
              <div
                className={RICH_TEXT_CLASSES}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? "" }}
              />
            </div>
          )}
        </div>

        <aside className="card h-fit min-w-0 space-y-4">
          <div>
            <h2 className="section-title">Pièces jointes</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Envoyées avec chaque email de ce modèle.</p>
          </div>
          {!isEditMode || !id ? (
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <Icon name="info" className="mt-0.5 h-4 w-4" />
              <p>Enregistrez le modèle avant d'ajouter des pièces jointes.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="template-attachments">
                  Ajouter des fichiers
                </label>
                <input
                  id="template-attachments"
                  type="file"
                  multiple
                  className="input text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:text-gray-300 dark:file:bg-brand-500/10 dark:file:text-brand-300"
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

              <div className="space-y-2">
                <p className="label">Pièces jointes actuelles</p>
                {attachments.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Aucune pièce jointe pour le moment.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                    {attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate text-gray-800 dark:text-gray-100" title={attachment.fileName}>
                            {attachment.fileName}
                          </p>
                          <p className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                            {Math.round(attachment.sizeBytes / 1024)} Ko
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 hover:text-red-600 dark:hover:text-red-400"
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
        </aside>
      </div>
    </div>
  );
}
