import { Router } from "express";
import authRoutes from "./auth.routes";
import smtpAccountsRoutes from "./smtpAccounts.routes";
import contactImportRoutes from "./contactImport.routes";
import contactsRoutes from "./contacts.routes";
import tagsRoutes from "./tags.routes";
import segmentsRoutes from "./segments.routes";
import templatesRoutes from "./templates.routes";
import campaignsRoutes from "./campaigns.routes";
import dashboardRoutes from "./dashboard.routes";
import draftsRoutes from "./drafts.routes";
import usersRoutes from "./users.routes";
import auditLogRoutes from "./auditLog.routes";
import companySearchRoutes from "./companySearch.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/smtp-accounts", smtpAccountsRoutes);

// Mounted at a distinct path prefix ("/contact-imports") rather than nested
// under "/contacts" (e.g. "/contacts/import") to avoid any ambiguity with
// the generic "/contacts/:id" route — Express would otherwise need "import"
// to never collide with a real contact id, which is fragile to rely on.
router.use("/contact-imports", contactImportRoutes);
router.use("/contacts", contactsRoutes);

router.use("/tags", tagsRoutes);
router.use("/segments", segmentsRoutes);
router.use("/templates", templatesRoutes);
router.use("/campaigns", campaignsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/drafts", draftsRoutes);
router.use("/users", usersRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/company-search", companySearchRoutes);

export default router;
