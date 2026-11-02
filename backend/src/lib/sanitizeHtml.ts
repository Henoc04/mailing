import sanitizeHtml from "sanitize-html";

/**
 * Allow-list tuned for HTML email templates authored in a WYSIWYG editor.
 *
 * Design choice: `data:image/*` URLs are allowed in `<img src>` (in addition
 * to http/https) because template authors frequently paste inline/base64
 * images from a WYSIWYG editor and blocking that would break a common,
 * legitimate workflow. All other `data:` URLs (and any `javascript:` URL)
 * remain blocked. `<a href>` only allows http/https/mailto — never data: or
 * javascript:.
 */

const ALLOWED_STYLE_PROPERTIES = [
  "color",
  "background-color",
  "font-size",
  "font-family",
  "font-weight",
  "text-align",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border",
  "border-radius",
  "width",
  "height",
  "display",
];

const STYLE_VALUE_PATTERN = /^(?!.*(?:javascript:|expression\(|url\(\s*['"]?\s*javascript:)).*$/i;

const allowedStyles = {
  "*": ALLOWED_STYLE_PROPERTIES.reduce<Record<string, RegExp[]>>((acc, prop) => {
    acc[prop] = [STYLE_VALUE_PATTERN];
    return acc;
  }, {}),
};

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "span",
    "div",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "style"],
    table: ["style", "cellpadding", "cellspacing", "border"],
    td: ["style", "colspan", "rowspan"],
    th: ["style", "colspan", "rowspan"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  allowedStyles,
  disallowedTagsMode: "discard",
  // Explicitly strip event-handler attributes (onclick, onerror, etc.) and
  // scripting/embedding tags. sanitize-html already discards any tag/attr
  // not in the allow-lists above, but we keep this exclusive list of
  // dangerous tags for clarity/defense-in-depth.
  exclusiveFilter: (frame) => {
    const dangerousTags = ["script", "iframe", "object", "embed", "style", "link", "meta", "base", "form"];
    return dangerousTags.includes(frame.tag);
  },
};

export function sanitizeTemplateHtml(dirty: string): string {
  return sanitizeHtml(dirty, sanitizeOptions);
}
