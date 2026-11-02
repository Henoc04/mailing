import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer, { FileFilterCallback } from "multer";
import type { Request } from "express";
import {
  ALLOWED_CONTACT_IMPORT_EXTENSIONS,
  ALLOWED_TEMPLATE_IMAGE_MIME_TYPES,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  UPLOADS_ATTACHMENTS_SUBDIR,
  UPLOADS_IMPORTS_SUBDIR,
  UPLOADS_ROOT_DIR,
  UPLOADS_TEMPLATES_SUBDIR,
} from "../config/constants";

const UPLOADS_BASE_DIR = path.join(process.cwd(), UPLOADS_ROOT_DIR);
const ATTACHMENTS_DIR = path.join(UPLOADS_BASE_DIR, UPLOADS_ATTACHMENTS_SUBDIR);
const IMPORTS_DIR = path.join(UPLOADS_BASE_DIR, UPLOADS_IMPORTS_SUBDIR);
const TEMPLATES_DIR = path.join(UPLOADS_BASE_DIR, UPLOADS_TEMPLATES_SUBDIR);
export const TEMPLATE_IMAGES_DIR = TEMPLATES_DIR;

for (const dir of [ATTACHMENTS_DIR, IMPORTS_DIR, TEMPLATES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Strips anything but alphanumerics, dots, dashes and underscores from a filename. */
function sanitizeFileName(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "file";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
  return `${safeBase}${safeExt}`;
}

/** Collision-safe filename: `<timestamp>-<random>-<sanitized original name>`. */
function buildCollisionSafeFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  const safeName = sanitizeFileName(originalName);
  return `${timestamp}-${random}-${safeName}`;
}

function makeDiskStorage(destinationDir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destinationDir);
    },
    filename: (_req, file, cb) => {
      cb(null, buildCollisionSafeFileName(file.originalname));
    },
  });
}

// ---- Attachments (multiple files, field name "attachments") ----
// No file-type restriction here on purpose — attachments are sent as-is over
// email, so any file type a user might legitimately want to attach (archives,
// office documents, executables, etc.) is accepted. Only the size limit applies.

export const uploadAttachments = multer({
  storage: makeDiskStorage(ATTACHMENTS_DIR),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
}).array("attachments", 10);

// ---- Contact import (single file, field name "file") ----
// Browsers send inconsistent / generic mimetypes for CSV and plain-text
// files (e.g. "application/vnd.ms-excel", "text/plain", or even an empty
// string), so we validate primarily by file extension and only use the
// mimetype as a loose secondary signal.

const CONTACT_IMPORT_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

function contactImportFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const extAllowed = (ALLOWED_CONTACT_IMPORT_EXTENSIONS as readonly string[]).includes(ext);
  const mimeAllowed = CONTACT_IMPORT_MIME_TYPES.includes(file.mimetype);

  if (extAllowed || mimeAllowed) {
    cb(null, true);
    return;
  }
  cb(new Error(`Unsupported contact import file type: ${file.originalname} (${file.mimetype})`));
}

export const uploadContactImport = multer({
  storage: makeDiskStorage(IMPORTS_DIR),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  fileFilter: contactImportFileFilter,
}).single("file");

// ---- Template image (single image, field name "image") ----

function templateImageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if ((ALLOWED_TEMPLATE_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`Unsupported image file type: ${file.mimetype}`));
}

export const uploadTemplateImage = multer({
  storage: makeDiskStorage(TEMPLATES_DIR),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  fileFilter: templateImageFileFilter,
}).single("image");
