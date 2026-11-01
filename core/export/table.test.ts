import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { crc32, toCsv, toXlsx, zipStore } from "./table";

/** Read a stored zip back: name → text. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const method = v.getUint16(at + 8, true);
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(crc32(data)).toBe(v.getUint32(at + 14, true));
    out.set(name, new TextDecoder().decode(method === 0 ? data : inflateRawSync(data)));
    at += 30 + nameLen + size;
  }
  expect(v.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return out;
}

describe("exports", () => {
  it("CSV quotes every cell, keeps accents and neutralises formulas", () => {
    const csv = toCsv([["Designer", "Note"], ["Zoë", 'said "hi", left'], [null, 3], ["=1+1", ""]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual(['"Designer","Note"', '"Zoë","said ""hi"", left"', '"","3"', `"'=1+1",""`, ""]);
  });

  it("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("an .xlsx workbook: valid zip, the parts Excel needs, numbers as numbers, text escaped", () => {
    const files = unzip(
      toXlsx([
        { name: "Designers", rows: [["Designer", "Submitted"], ["Dana <A&B>", 12]] },
        { name: "Jobs/Oct", rows: [["Job"], ["RN-C-1"]] },
      ]),
    );
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]),
    );
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="B2"><v>12</v></c>');
    expect(sheet).toContain("Dana &lt;A&amp;B&gt;");
    expect(files.get("xl/workbook.xml")).toContain('name="Jobs Oct"');
  });

  it("zipStore round-trips several files", () => {
    const z = unzip(zipStore([{ name: "a.txt", data: new TextEncoder().encode("alpha") }, { name: "b/c.txt", data: new TextEncoder().encode("") }]));
    expect(Object.fromEntries(z)).toEqual({ "a.txt": "alpha", "b/c.txt": "" });
  });
});
