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

export interface InjectTrackingParams {
  bodyHtml: string;
  trackingToken: string;
  publicBaseUrl: string;
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

// Click tracking is suspended: links are sent untouched so recipients reach
// the real destination directly. The /t/c redirect route stays mounted so
// links in emails already sent keep working once the proxy forwards /t/.
const CLICK_TRACKING_ENABLED = false;

/**
 * Appends an invisible open-tracking pixel to the HTML body and, when click
 * tracking is enabled, rewrites every `<a href="http(s)://...">` link to
 * route through the click-tracking redirect endpoint.
 */
export function injectTracking(params: InjectTrackingParams): string {
  const { bodyHtml, trackingToken, publicBaseUrl } = params;

  const withTrackedLinks = CLICK_TRACKING_ENABLED
    ? bodyHtml.replace(
        ANCHOR_HREF_PATTERN,
        (_match, beforeAttrs: string, quote: string, originalHref: string, afterAttrs: string) => {
          const trackedHref = `${publicBaseUrl}/t/c/${trackingToken}?u=${encodeURIComponent(originalHref)}`;
          return `<a ${beforeAttrs}href=${quote}${trackedHref}${quote}${afterAttrs}>`;
        }
      )
    : bodyHtml;

  const pixelTag = `<img src="${publicBaseUrl}/t/o/${trackingToken}.png" width="1" height="1" style="display:none" alt="" />`;

  const bodyCloseIndex = withTrackedLinks.search(/<\/body\s*>/i);
  if (bodyCloseIndex === -1) {
    return `${withTrackedLinks}${pixelTag}`;
  }

  return `${withTrackedLinks.slice(0, bodyCloseIndex)}${pixelTag}${withTrackedLinks.slice(bodyCloseIndex)}`;
}
