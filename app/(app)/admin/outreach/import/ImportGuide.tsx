"use client";

import { CSV_COLUMNS, sampleCsv } from "@/core/outreach";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";

import { td, th } from "../shared";

/** How to prepare the file, with a sample to fill in. Open on a first visit. */
export function ImportGuide({ open }: { open: boolean }) {
  function download() {
    const url = URL.createObjectURL(new Blob([sampleCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "outreach-contacts-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-[var(--s-5)]">
          <CardTitle>How to prepare your file</CardTitle>
          <span className="text-[length:var(--fs-2)] underline underline-offset-2">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <CardBody className="space-y-5 pt-0 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
          <ol className="list-inside list-decimal space-y-2">
            <li>
              Put your contacts in a spreadsheet, one person or business per row, with headings in the first row. The easiest start:{" "}
              <Button type="button" variant="link" onClick={download}>download the sample file</Button> and fill it in.
            </li>
            <li>
              Save it as CSV. <span className="font-medium">Google Sheets:</span> File → Download → Comma-separated values (.csv).{" "}
              <span className="font-medium">Excel:</span> File → Save As → CSV UTF-8 (comma delimited).
            </li>
            <li>Choose the list (people you know, or prospects), choose the file below, check the columns, then press Import.</li>
            <li>Or skip the file: copy the cells in your spreadsheet (headings included) and paste them in the box below.</li>
          </ol>
          <div>
            <p className="font-medium">Every row needs only two things</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              <li>a business name, a contact name or an email; and</li>
              <li>one way to reach them: email, phone, WhatsApp, Instagram or LinkedIn.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Leave any other column empty, or leave it out. Headings can be in any order and other names work too (“Company”, “E-mail”,
              “Mobile”): you can change any column before importing. Repeats, existing clients and anyone marked do-not-contact are skipped
              and counted.
            </p>
          </div>
          <p className="font-medium">The columns</p>
          <div tabIndex={0} role="region" aria-label="Import columns" className="overflow-x-auto rounded-[var(--r-md)] border border-border">
            <table className="w-full min-w-[560px] text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {["Heading", "What goes in it", "Needed?", "Example"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CSV_COLUMNS.map((c) => (
                  <tr key={c.heading} className="border-b border-border last:border-b-0">
                    <td className={`${td} font-mono font-medium`}>{c.heading}</td>
                    <td className={td}>{c.what || "—"}</td>
                    <td className={td}>{c.needed}</td>
                    <td className={`${td} text-muted-foreground`}>{c.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </details>
    </Card>
  );
}
