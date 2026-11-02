/**
 * Cross-cutting constants shared by later layers (pagination, uploads, auth).
 * Keep this file limited to values actually consumed elsewhere in the app.
 */

// ---- Pagination ----
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---- Uploads ----
export const MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_CONTACT_IMPORT_EXTENSIONS = [".csv", ".txt", ".xlsx", ".xls"] as const;

export const ALLOWED_TEMPLATE_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

// ---- Uploads directories (relative to backend root) ----
export const UPLOADS_ROOT_DIR = "uploads";
export const UPLOADS_ATTACHMENTS_SUBDIR = "attachments";
export const UPLOADS_IMPORTS_SUBDIR = "imports";
export const UPLOADS_TEMPLATES_SUBDIR = "templates";

// ---- Auth ----
export const AUTH_HEADER_NAME = "authorization";
export const AUTH_BEARER_PREFIX = "Bearer ";
