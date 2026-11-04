import { createHmac, timingSafeEqual } from "crypto";
import type { Contact } from "@prisma/client";
import { sanitizeTemplateHtml } from "../lib/sanitizeHtml";

/**
 * Builds the `{{variable}}` map from a Contact row. Every value is coerced
 * to a string, with `null`/`undefined` fields falling back to `""` rather
 * than the literal strings `"null"`/`"undefined"` that naive
 * `String(value)` coercion would otherwise produce.
 */
export function extractMergeData(contact: Contact): Record<string, string> {
  const toStr = (value: string | null | undefined): string => value ?? "";

  return {
    prenom: toStr(contact.prenom),
    nom: toStr(contact.nom),
    genre: toStr(contact.genre),
    entreprise: toStr(contact.entreprise),
    fonction: toStr(contact.fonction),
    adresse: toStr(contact.adresse),
    codePostal: toStr(contact.codePostal),
    ville: toStr(contact.ville),
    departement: toStr(contact.departement),
    region: toStr(contact.region),
    pays: toStr(contact.pays),
    siteWeb: toStr(contact.siteWeb),
    telephone: toStr(contact.telephone),
    email: toStr(contact.email),
  };
}

/** Escapes `&`, `<`, `>`, `"`, `'` so interpolated values can never inject markup/attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replaces every `{{variableName}}` occurrence (tolerant of inner
 * whitespace, e.g. `{{ prenom }}`) with the HTML-escaped value from
 * `mergeData`.
 *
 * Design choice: an unknown/unrecognized variable name is replaced with an
 * empty string rather than left as the literal `{{x}}` placeholder. This
 * avoids ever leaking template syntax into a sent email if a template
 * references a variable that doesn't exist on the merge data map (e.g. a
 * typo, or a field removed from the Contact model later) — a blank space
 * is a much safer failure mode than visible mustache syntax in a
 * recipient's inbox.
 */
export function renderTemplate(text: string, mergeData: Record<string, string>): string {
  return text.replace(VARIABLE_PATTERN, (_match, variableName: string) => {
    const value = mergeData[variableName];
    return escapeHtml(value ?? "");
  });
}

export interface RenderCampaignContentParams {
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  mergeData: Record<string, string>;
}

export interface RenderedCampaignContent {
  subject: string;
  bodyHtml: string;
}

/**
 * Renders both the subject and HTML body against the same merge data, then
 * re-sanitizes the rendered HTML. This is defense in depth: the template's
 * HTML was already sanitized once at save time (see `template.service.ts`),
 * but a contact field (e.g. `entreprise`) could theoretically contain
 * something like `<script>` — `renderTemplate` already HTML-escapes that,
 * but re-running `sanitizeTemplateHtml` after interpolation guarantees the
 * final HTML sent to recipients can never carry an unexpected tag/attribute
 * even if a future change to `renderTemplate` regresses the escaping.
 */
export function renderCampaignContent(params: RenderCampaignContentParams): RenderedCampaignContent {
  const { subjectTemplate, bodyHtmlTemplate, mergeData } = params;

  const subject = renderTemplate(subjectTemplate, mergeData);
  const renderedHtml = renderTemplate(bodyHtmlTemplate, mergeData);
  const bodyHtml = preserveLineBreaksForEmail(sanitizeTemplateHtml(renderedHtml));

  return { subject, bodyHtml };
}

const PARAGRAPH_SPACING_STYLE = "margin:0 0 1em 0;";

/**
 * The editor emits one `<p>` per line and an empty `<p></p>` per blank line.
 * Mail clients don't render those like the editor does: empty paragraphs
 * collapse to zero height (blank lines vanish) and Outlook drops default
 * paragraph margins (lines get glued together). Giving every paragraph an
 * explicit inline margin and every empty paragraph a non-breaking space
 * makes the received email keep the line breaks seen in the editor.
 */
export function preserveLineBreaksForEmail(html: string): string {
  return html
    .replace(/<p(\s[^>]*)?>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, (_m, attrs: string | undefined) => `<p${attrs ?? ""}>&nbsp;</p>`)
    .replace(/<p(\s[^>]*)?>/gi, (_m, attrs: string | undefined) => {
      if (!attrs) return `<p style="${PARAGRAPH_SPACING_STYLE}">`;
      const styleMatch = attrs.match(/style=(["'])(.*?)\1/i);
      if (!styleMatch) return `<p${attrs} style="${PARAGRAPH_SPACING_STYLE}">`;
      if (/margin/i.test(styleMatch[2])) return `<p${attrs}>`;
      return `<p${attrs.replace(styleMatch[0], `style=${styleMatch[1]}${PARAGRAPH_SPACING_STYLE}${styleMatch[2]}${styleMatch[1]}`)}>`;
    })
    // Paragraphs inside list items would otherwise space bullets apart.
    .replace(/(<li[^>]*>\s*)<p style="margin:0 0 1em 0;/gi, '$1<p style="margin:0;');
}

export function buildUnsubscribeUrl(publicBaseUrl: string, trackingToken: string): string {
  // Under /api so the production reverse proxy (which forwards /api to the
  // backend) reaches it — unlike /t/*, which needs an extra proxy rule.
  return `${publicBaseUrl}/api/unsubscribe/${trackingToken}`;
}

/**
 * Appends the legally required unsubscribe footer (RGPD/LCEN). Must run
 * AFTER `injectTracking`, so the unsubscribe link is never rewritten into a
 * click-tracking redirect.
 */
export function appendUnsubscribeFooter(bodyHtml: string, unsubscribeUrl: string): string {
  const footer =
    `<p style="margin:32px 0 0 0;font-size:12px;color:#888888;text-align:center;">` +
    `Vous ne souhaitez plus recevoir nos emails ? ` +
    `<a href="${unsubscribeUrl}" style="color:#888888;">Se désinscrire</a></p>`;

  const bodyCloseIndex = bodyHtml.search(/<\/body\s*>/i);
  if (bodyCloseIndex === -1) {
    return `${bodyHtml}${footer}`;
  }
  return `${bodyHtml.slice(0, bodyCloseIndex)}${footer}${bodyHtml.slice(bodyCloseIndex)}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  euro: "€",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Plain-text alternative sent alongside the HTML. HTML-only emails are a
 * classic spam signal, and some recipients read mail in text-only clients.
 * Links are kept readable as "text (url)".
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a\s[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      return label && label !== href ? `${label} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    // No newline on </li>: each <li> already starts its own line.
    .replace(/<\/(p|div|h[1-6]|tr|blockquote|ul|ol|table)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|tr|blockquote|ul|ol|table)(\s[^>]*)?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface InjectTrackingParams {
  bodyHtml: string;
  trackingToken: string;
  publicBaseUrl: string;
  /** Secret used to sign click-redirect links (see `signClickUrl`). */
  clickSigningSecret: string;
}

/**
 * Signature binding a click-redirect link to its tracking token and target
 * URL. Without it the public /t/c endpoint would redirect anywhere, letting
 * anyone use our domain to disguise phishing links.
 */
export function signClickUrl(trackingToken: string, url: string, secret: string): string {
  return createHmac("sha256", `click:${secret}`).update(`${trackingToken}\n${url}`).digest("base64url").slice(0, 22);
}

export function isValidClickSignature(trackingToken: string, url: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signClickUrl(trackingToken, url, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Matches an opening `<a ...href="http(s)://...">` tag, capturing:
//   1. any attributes before `href`
//   2. the quote character used (" or ')
//   3. the href value itself (http/https only)
//   4. any attributes after `href`
// Deliberately regex-based rather than a full HTML parser: this is a
// pragmatic tradeoff to avoid adding a new dependency. It is robust enough
// for the well-formed HTML produced by our own sanitizer/WYSIWYG editor
// (single `<a>` tag per match, standard quoting) but is NOT a general
// purpose HTML parser — it would not correctly handle deliberately
// malformed/obfuscated markup. Since this only ever runs on HTML that has
// already passed through `sanitizeTemplateHtml`, that's an acceptable risk.
const ANCHOR_HREF_PATTERN = /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi;

// Links are rewritten through the signed /api/t/c redirect to count clicks.
// Mirrored by CLICK_TRACKING_ENABLED in frontend/src/config/features.ts.
const CLICK_TRACKING_ENABLED = true;

/**
 * Appends an invisible open-tracking pixel to the HTML body and, when click
 * tracking is enabled, rewrites every `<a href="http(s)://...">` link to
 * route through the click-tracking redirect endpoint.
 */
export function injectTracking(params: InjectTrackingParams): string {
  const { bodyHtml, trackingToken, publicBaseUrl, clickSigningSecret } = params;

  const withTrackedLinks = CLICK_TRACKING_ENABLED
    ? bodyHtml.replace(
        ANCHOR_HREF_PATTERN,
        (_match, beforeAttrs: string, quote: string, originalHref: string, afterAttrs: string) => {
          // The editor stores "&" as "&amp;" inside href; sign and redirect to
          // the URL the recipient would actually have reached.
          const targetUrl = originalHref.replace(/&amp;/g, "&");
          const signature = signClickUrl(trackingToken, targetUrl, clickSigningSecret);
          const trackedHref = `${publicBaseUrl}/api/t/c/${trackingToken}?u=${encodeURIComponent(targetUrl)}&amp;s=${signature}`;
          return `<a ${beforeAttrs}href=${quote}${trackedHref}${quote}${afterAttrs}>`;
        }
      )
    : bodyHtml;

  const pixelTag = `<img src="${publicBaseUrl}/api/t/o/${trackingToken}.png" width="1" height="1" style="display:none" alt="" />`;

  const bodyCloseIndex = withTrackedLinks.search(/<\/body\s*>/i);
  if (bodyCloseIndex === -1) {
    return `${withTrackedLinks}${pixelTag}`;
  }

  return `${withTrackedLinks.slice(0, bodyCloseIndex)}${pixelTag}${withTrackedLinks.slice(bodyCloseIndex)}`;
}
