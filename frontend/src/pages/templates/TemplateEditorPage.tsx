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
      title={label}
      className={`rounded-md px-2 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-brand-600 text-white dark:bg-brand-500"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {children}
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
    <div className="absolute z-20 mt-1 flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <input
        type="text"
        autoFocus
        className="input w-56"
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
      <Button type="button" size="sm" onClick={applyLink}>
        Insérer
      </Button>
      <button
        type="button"
        onClick={onClose}
        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        aria-label="Fermer"
      >
        &times;
      </button>
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
    <div className="absolute z-20 mt-1 flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <label className="cursor-pointer whitespace-nowrap rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
        {isUploading ? "Envoi..." : "Depuis mon PC"}
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
      <span className="text-xs text-gray-400">ou</span>
      <input
        type="text"
        autoFocus
        className="input w-64"
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
      <Button type="button" size="sm" onClick={applyImage}>
        Insérer
      </Button>
      <button
        type="button"
        onClick={onClose}
        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        aria-label="Fermer"
      >
        &times;
      </button>
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
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
      <ToolbarButton label="Gras" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">G</span>
      </ToolbarButton>
      <ToolbarButton label="Italique" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      {/* StarterKit provides Strike, not Underline (no @tiptap/extension-underline
          is in the installed dependency list), so this toggles strikethrough. */}
      <ToolbarButton label="Barré" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">B</span>
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

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

      <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

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

      <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      <div className="relative">
        <ToolbarButton label="Insérer un lien" active={editor.isActive("link")} onClick={() => togglePopover("link")}>
          🔗
        </ToolbarButton>
        {openPopover === "link" && <LinkPopover editor={editor} onClose={() => setOpenPopover(null)} />}
      </div>

      <div className="relative">
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

      <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      <div className="relative">
        <ToolbarButton label="Insérer une variable" onClick={() => togglePopover("variables")}>
          {"{{ }}"} Variables
        </ToolbarButton>
        {openPopover === "variables" && (
          <div className="absolute z-20 mt-1 flex flex-col rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {VARIABLE_OPTIONS.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => insertVariable(variable.token)}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {variable.label} <span className="text-gray-400 dark:text-gray-500">{variable.token}</span>
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

  if (isEditMode && templateQuery.isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {isEditMode ? "Modifier le modèle" : "Nouveau modèle"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Composez le contenu HTML de votre email, avec variables de personnalisation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleBack}>
            Retour
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
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

        <div className="flex items-center gap-2">
          <input
            id="template-is-draft"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            checked={isDraft}
            onChange={(e) => {
              setIsDraft(e.target.checked);
              setIsDirty(true);
            }}
          />
          <label htmlFor="template-is-draft" className="text-sm text-gray-700 dark:text-gray-300">
            Enregistrer comme brouillon
          </label>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <span className="label mb-0">Corps de l'email</span>
          <div className="flex gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-700">
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                viewMode === "editor"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-300"
              }`}
            >
              Éditeur
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                viewMode === "preview"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-300"
              }`}
            >
              Aperçu
            </button>
          </div>
        </div>

        {viewMode === "editor" && editor && (
          <div>
            <EditorToolbar editor={editor} />
            <div className="rounded-b-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <EditorContent
                editor={editor}
                className="prose prose-sm min-h-[300px] max-w-none dark:prose-invert focus:outline-none"
              />
            </div>
          </div>
        )}

        {viewMode === "preview" && (
          // Aperçu = the CURRENT, PRE-save editor content rendered directly in the
          // user's own browser (their own draft, not a shared/multi-tenant surface).
          // This is NOT yet the backend's sanitize-html pass — that only happens on
          // save/persist. Still safe here since it's local content in the author's
          // own session.
          <div className="min-h-[300px] rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? "" }}
            />
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <span className="label mb-0">Pièces jointes</span>
        {!isEditMode || !id ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enregistrez le modèle avant d'ajouter des pièces jointes.
          </p>
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
    </div>
  );
}
