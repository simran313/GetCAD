import { describe, expect, it } from "vitest";

import { buildRows, chunk, gmailComposeUrl, guessMapping, looksLikeHeader, parseTable, replyRate, websiteUrl, whatsappUrl } from ".";

describe("parseTable", () => {
  it("reads quoted commas, doubled quotes and line breaks inside a cell", () => {
    const csv = '﻿Business,Email,Notes\r\n"Bright, Bridal",ana@example.com,"Said ""call me""\nnext week"\r\n\r\nCast House,orders@example.com,\n';
    expect(parseTable(csv)).toEqual([
      ["Business", "Email", "Notes"],
      ["Bright, Bridal", "ana@example.com", 'Said "call me"\nnext week'],
      ["Cast House", "orders@example.com", ""],
    ]);
  });

  it("reads cells pasted from a spreadsheet (tabs) and semicolon files", () => {
    expect(parseTable("Name\tEmail\nAna\tana@example.com")).toEqual([["Name", "Email"], ["Ana", "ana@example.com"]]);
    expect(parseTable("Name;Email\nAna;ana@example.com")).toEqual([["Name", "Email"], ["Ana", "ana@example.com"]]);
  });
});

describe("guessMapping", () => {
  it("maps the usual headings, each field once", () => {
    expect(guessMapping(["Company Name", "Contact Person", "E-mail", "Mobile", "IG", "State", "Country", "Remarks", "Fax"])).toEqual([
      "business_name", "contact_name", "email", "phone", "instagram", "region", "country", "notes", null,
    ]);
    expect(guessMapping(["Email", "Email 2"])).toEqual(["email", null]);
  });

  it("maps every heading the outbound kit recommends without changes", async () => {
    const { readFileSync } = await import("node:fs");
    const kit = readFileSync("docs/marketing/OUTBOUND-KIT.md", "utf8");
    const line = kit.match(/these headings import without changes: (.+)/)![1]!;
    const heads = line.split(" · ");
    expect(heads.length).toBe(14);
    expect(guessMapping(heads).every(Boolean)).toBe(true);
    expect(new Set(guessMapping(heads)).size).toBe(14);
  });

  it("tells a heading row from a contact row", () => {
    expect(looksLikeHeader(["Business", "Email"])).toBe(true);
    expect(looksLikeHeader(["Bright Bridal", "ana@example.com"])).toBe(false);
  });
});

describe("buildRows", () => {
  it("keeps the sheet's row number, skips empty rows and joins two columns mapped to tags", () => {
    const table = [["Biz", "Mail", "T1", "T2"], ["A", "a@example.com", "bridal", "texas"], ["", "", "", ""], ["B", "", "", ""]];
    expect(buildRows(table, ["business_name", "email", "tags", "tags"], true)).toEqual([
      { _row: 2, business_name: "A", email: "a@example.com", tags: "bridal, texas" },
      { _row: 4, business_name: "B" },
    ]);
  });

  it("splits into the database's parts", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("links", () => {
  it("opens Gmail compose from the sender's account", () => {
    const url = new URL(gmailComposeUrl("ana@example.com", { from: "team@example.org", subject: "Hi Ana", body: "Line 1\nLine 2" }));
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: "cm", fs: "1", to: "ana@example.com", su: "Hi Ana", body: "Line 1\nLine 2", authuser: "team@example.org",
    });
  });

  it("builds WhatsApp and website links, refusing what cannot work", () => {
    expect(whatsappUrl("+1 (702) 555-0142", "Hi")).toBe("https://wa.me/17025550142?text=Hi");
    expect(whatsappUrl("123")).toBeNull();
    expect(websiteUrl("brightbridal.example.com")).toBe("https://brightbridal.example.com");
    expect(websiteUrl("not a site")).toBeNull();
  });

  it("gives a reply rate only once someone was written to", () => {
    expect(replyRate(0, 0)).toBeNull();
    expect(replyRate(40, 3)).toBe(8);
  });
});
