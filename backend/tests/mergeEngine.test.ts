import { describe, expect, it } from "vitest";
import {
  appendUnsubscribeFooter,
  buildUnsubscribeUrl,
  htmlToText,
  injectTracking,
  preserveLineBreaksForEmail,
  renderCampaignContent,
  renderTemplate,
} from "../src/services/mergeEngine.service";

describe("renderTemplate", () => {
  it("replaces variables, tolerating inner whitespace", () => {
    expect(renderTemplate("Bonjour {{prenom}} {{ nom }}", { prenom: "Awa", nom: "Koné" })).toBe("Bonjour Awa Koné");
  });

  it("HTML-escapes values so contact data can't inject markup", () => {
    expect(renderTemplate("{{entreprise}}", { entreprise: '<script>alert("x")</script>' })).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("replaces unknown variables with an empty string rather than leaking {{...}}", () => {
    expect(renderTemplate("A{{inconnu}}B", {})).toBe("AB");
  });
});

describe("preserveLineBreaksForEmail", () => {
  it("gives paragraphs explicit spacing and keeps blank lines visible", () => {
    const out = preserveLineBreaksForEmail("<p>Ligne 1</p><p></p><p>Ligne 2</p>");
    expect(out).toBe(
      '<p style="margin:0 0 1em 0;">Ligne 1</p><p style="margin:0 0 1em 0;">&nbsp;</p><p style="margin:0 0 1em 0;">Ligne 2</p>'
    );
  });

  it("keeps existing inline styles such as alignment", () => {
    expect(preserveLineBreaksForEmail('<p style="text-align:center">X</p>')).toBe(
      '<p style="margin:0 0 1em 0;text-align:center">X</p>'
    );
  });

  it("keeps list items tight", () => {
    expect(preserveLineBreaksForEmail("<ul><li><p>A</p></li></ul>")).toBe('<ul><li><p style="margin:0;">A</p></li></ul>');
  });
});

describe("renderCampaignContent", () => {
  it("renders subject and body and strips dangerous markup", () => {
    const { subject, bodyHtml } = renderCampaignContent({
      subjectTemplate: "Offre pour {{entreprise}}",
      bodyHtmlTemplate: "<p>Bonjour {{prenom}}</p><script>evil()</script>",
      mergeData: { prenom: "Awa", entreprise: "SAV PLUS" },
    });
    expect(subject).toBe("Offre pour SAV PLUS");
    expect(bodyHtml).toContain("Bonjour Awa");
    expect(bodyHtml).not.toContain("script");
  });
});

describe("injectTracking", () => {
  const base = "https://crm.example.test";

  it("adds the open-tracking pixel", () => {
    const out = injectTracking({ bodyHtml: "<p>Hi</p>", trackingToken: "TOK", publicBaseUrl: base });
    expect(out).toContain(`<img src="${base}/t/o/TOK.png"`);
  });

  it("leaves links untouched while click tracking is suspended", () => {
    const html = '<p><a href="https://site.test/offre">Offre</a></p>';
    const out = injectTracking({ bodyHtml: html, trackingToken: "TOK", publicBaseUrl: base });
    expect(out).toContain('href="https://site.test/offre"');
    expect(out).not.toContain("/t/c/");
  });

  it("inserts the pixel before </body> when present", () => {
    const out = injectTracking({ bodyHtml: "<html><body><p>x</p></body></html>", trackingToken: "T", publicBaseUrl: base });
    expect(out.indexOf("/t/o/T.png")).toBeLessThan(out.indexOf("</body>"));
  });
});

describe("unsubscribe footer", () => {
  it("builds the URL under /api so the production proxy forwards it", () => {
    expect(buildUnsubscribeUrl("https://crm.example.test", "TOK")).toBe("https://crm.example.test/api/unsubscribe/TOK");
  });

  it("appends a visible unsubscribe link", () => {
    const out = appendUnsubscribeFooter("<p>Corps</p>", "https://crm.example.test/api/unsubscribe/TOK");
    expect(out.startsWith("<p>Corps</p>")).toBe(true);
    expect(out).toContain('href="https://crm.example.test/api/unsubscribe/TOK"');
    expect(out).toContain("Se désinscrire");
  });

  it("places the footer inside <body> for full-document templates", () => {
    const out = appendUnsubscribeFooter("<html><body><p>x</p></body></html>", "https://u.test");
    expect(out.indexOf("Se désinscrire")).toBeLessThan(out.indexOf("</body>"));
  });
});

describe("htmlToText", () => {
  it("turns paragraphs, line breaks and lists into readable text", () => {
    const text = htmlToText("<p>Bonjour Awa,</p><p>&nbsp;</p><p>Ligne 1<br />suite</p><ul><li>Point A</li><li>Point B</li></ul>");
    expect(text).toBe("Bonjour Awa,\n\nLigne 1\nsuite\n\n- Point A\n- Point B");
  });

  it("keeps link targets visible", () => {
    expect(htmlToText('<p>Voir <a href="https://site.test/x">notre offre</a></p>')).toBe(
      "Voir notre offre (https://site.test/x)"
    );
  });

  it("drops images (incl. the tracking pixel) and decodes entities", () => {
    expect(htmlToText('<p>Caf&eacute; &amp; th&#233;</p><img src="https://t/o.png" />')).toBe("Café & thé");
  });
});
