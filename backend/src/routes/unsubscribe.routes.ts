import { Router, type Response } from "express";
import { asyncHandler } from "../controllers/asyncHandler";
import * as unsubscribeService from "../services/unsubscribe.service";

/**
 * Public (no auth) unsubscribe endpoints reached from the link/header in
 * every campaign email.
 *
 * GET only shows a confirmation page: corporate mail scanners (e.g. Outlook
 * Safe Links) pre-fetch links in received emails, and unsubscribing on GET
 * would silently unsubscribe people who never clicked. The actual change is
 * a POST — from the confirmation button, or directly from Gmail/Yahoo's
 * one-click unsubscribe (RFC 8058, `List-Unsubscribe-Post`).
 */
const router = Router();

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage(res: Response, status: number, title: string, body: string): void {
  res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
        `<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1f2937;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}` +
        `.card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:32px;max-width:420px;margin:16px;text-align:center}` +
        `h1{font-size:20px;margin:0 0 12px}p{color:#4b5563;line-height:1.5}` +
        `button{background:#dc2626;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer}button:hover{background:#b91c1c}</style>` +
        `</head><body><div class="card"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`
    );
}

router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const target = await unsubscribeService.findByToken(req.params.token);
    if (!target) {
      renderPage(res, 404, "Lien invalide", "<p>Ce lien de désinscription n'est pas ou plus valide.</p>");
      return;
    }
    if (target.isUnsubscribed) {
      renderPage(
        res,
        200,
        "Déjà désinscrit",
        `<p>L'adresse <strong>${escapeHtml(unsubscribeService.maskEmail(target.email))}</strong> ne reçoit plus nos emails.</p>`
      );
      return;
    }
    renderPage(
      res,
      200,
      "Se désinscrire",
      `<p>Confirmez-vous ne plus vouloir recevoir nos emails à l'adresse <strong>${escapeHtml(
        unsubscribeService.maskEmail(target.email)
      )}</strong> ?</p>` +
        `<form method="post"><button type="submit">Confirmer la désinscription</button></form>`
    );
  })
);

router.post(
  "/:token",
  asyncHandler(async (req, res) => {
    const target = await unsubscribeService.findByToken(req.params.token);
    if (!target) {
      renderPage(res, 404, "Lien invalide", "<p>Ce lien de désinscription n'est pas ou plus valide.</p>");
      return;
    }
    await unsubscribeService.unsubscribe(target.contactId);
    renderPage(
      res,
      200,
      "Désinscription confirmée",
      `<p>L'adresse <strong>${escapeHtml(
        unsubscribeService.maskEmail(target.email)
      )}</strong> ne recevra plus nos emails.</p>`
    );
  })
);

export default router;
