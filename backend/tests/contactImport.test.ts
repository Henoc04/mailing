import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { importRows, parseFile } from "../src/services/contactImport.service";
import { maskEmail } from "../src/services/unsubscribe.service";
import * as contactService from "../src/services/contact.service";

vi.mock("../src/services/contact.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/contact.service")>();
  return {
    ...actual,
    bulkCreate: vi.fn(async (_ownerId: string, contacts: unknown[]) => ({ created: contacts.length, skipped: 0, errors: [] })),
  };
});

describe("importRows", () => {
  const mapping = { nom: "Nom", email: "Email" };

  it("reports errors with the real file line numbers (header = line 1)", async () => {
    const result = await importRows("owner", [{ Nom: "A", Email: "a@x.fr" }, { Nom: "", Email: "b@x.fr" }], mapping);
    expect(result.errors).toEqual([{ row: 3, message: "Le nom est manquant" }]);
  });

  it("flags duplicates inside the file and normalizes email case", async () => {
    const result = await importRows(
      "owner",
      [
        { Nom: "A", Email: " Contact@X.fr " },
        { Nom: "B", Email: "contact@x.fr" },
      ],
      mapping
    );
    expect(result.created).toBe(1);
    expect(result.errors[0]).toEqual({ row: 3, message: "Doublon dans le fichier : contact@x.fr (déjà présent ligne 2)" });
    const bulkCreate = vi.mocked(contactService.bulkCreate);
    const sent = bulkCreate.mock.calls.at(-1)?.[1] ?? [];
    expect(sent.map((c) => c.email)).toEqual(["contact@x.fr"]);
  });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailing-import-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeFile(name: string, content: string | Buffer): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

describe("parseFile (CSV)", () => {
  it("detects the ';' delimiter used by French Excel exports", async () => {
    const file = writeFile("semi.csv", "Nom;Email\nMairie A;a@x.fr\n");
    const parsed = await parseFile(file, ".csv");
    expect(parsed.headers).toEqual(["Nom", "Email"]);
    expect(parsed.rows[0]).toEqual({ Nom: "Mairie A", Email: "a@x.fr" });
  });

  it("tolerates rows with missing/extra columns and stray quotes", async () => {
    const file = writeFile("irregular.csv", 'Nom;Email;Ville\nA;a@x.fr;Lyon;extra\nB;b@x.fr\nMairie "C";c@x.fr;Paris\n');
    const parsed = await parseFile(file, ".csv");
    expect(parsed.rows).toHaveLength(3);
  });

  it("decodes Windows-1252 files without corrupting accents", async () => {
    const file = writeFile("latin1.csv", Buffer.from("Nom;Département\nYaté;Côte\n", "latin1"));
    const parsed = await parseFile(file, ".csv");
    expect(parsed.headers).toEqual(["Nom", "Département"]);
    expect(parsed.rows[0].Nom).toBe("Yaté");
  });
});

describe("maskEmail", () => {
  it("hides most of the local part", () => {
    expect(maskEmail("jean.dupont@exemple.fr")).toBe("j***@exemple.fr");
  });
});
