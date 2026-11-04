import { describe, expect, it } from "vitest";

import { parseDesignerLines } from "./parse";

describe("parseDesignerLines", () => {
  it("reads the owner's list as pasted", () => {
    const { people, problems } = parseDesignerLines(
      [
        "sandip.m22@example.com - Sandip Maity",
        "Abinash.CAD@example.com - Abinash Mondal",
        "",
        "vishwajit39@example.com - Vishwajit Ghosh ",
        "shubham8017485198@example.com - Shubham Mondal",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(people).toEqual([
      { email: "sandip.m22@example.com", name: "Sandip Maity", phone: null },
      { email: "abinash.cad@example.com", name: "Abinash Mondal", phone: null },
      { email: "vishwajit39@example.com", name: "Vishwajit Ghosh", phone: null },
      { email: "shubham8017485198@example.com", name: "Shubham Mondal", phone: null },
    ]);
  });

  it("takes name first, commas, tabs and a phone number", () => {
    const { people } = parseDesignerLines("Rick Samanta, rick@example.com, +91 98765 43210\nArpan Ghorui\tarpan@example.com");
    expect(people).toEqual([
      { email: "rick@example.com", name: "Rick Samanta", phone: "+91 98765 43210" },
      { email: "arpan@example.com", name: "Arpan Ghorui", phone: null },
    ]);
  });

  it("says which lines it cannot read, and repeats", () => {
    const { people, problems } = parseDesignerLines("Kousik Hazra\nkousik@example.com\na@example.com - A One\nA@example.com - A Again");
    expect(people).toEqual([{ email: "a@example.com", name: "A One", phone: null }]);
    expect(problems.map((p) => [p.line, p.reason])).toEqual([
      [1, "no email on this line"],
      [2, "no name on this line"],
      [4, "this email is already in the list"],
    ]);
  });
});
