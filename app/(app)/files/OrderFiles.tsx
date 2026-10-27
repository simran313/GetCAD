import { fileGrantFor, type FileKind } from "@/core";
import { buttonVariants } from "@/components/ui/button";

/**
 * One order's files for its client: the unlock note, the QC documents and
 * every version the download gate lets them see. Shared by the Files page
 * and the order page's Files sheet, so both offer exactly what /api/files
 * serves.
 */
export interface FileVersionRow {
  id: string;
  order_id: string;
  kind: FileKind;
  content_type: string;
  size_bytes: number;
  uploader_party: string;
  version_no: number;
}

/** Statuses past QC: documents exist and fingerprints are recorded (0050). */
export const POST_QC = ["CLIENT_PREVIEW", "APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED", "DISPUTED", "REVISION_REQUESTED"];

const KIND_WORDS: Partial<Record<FileKind, [string, string]>> = {
  STL: ["For your caster", "STL · print-ready"],
  RHINO_3DM: ["For editing", "3DM · Rhino, layered"],
  SUMMARY_SHEET: ["Summary sheet", "Weights, stones, sizes"],
  RENDER: ["Render", "Image"],
  WEIGHT_CHART: ["Gold weight", "Image"],
  DIAMOND_DETAILS: ["Diamond details", "Image"],
  CLIENT_REFERENCE: ["Your file", "Sent by you"],
  OTHER: ["File", ""],
};

export const fileSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** The files this client may see on an order, with their grant. */
export function visibleFiles(order: { status: string }, files: FileVersionRow[], role: string) {
  return files
    .map((f) => ({
      f,
      grant: fileGrantFor({
        orderStatus: order.status,
        role,
        isOrderClient: true,
        isOrderDesigner: false,
        isUploader: f.uploader_party === "CLIENT",
        fileKind: f.kind,
      }),
    }))
    .filter((r) => r.grant !== "NONE");
}

export function OrderFiles({
  order,
  files,
  role,
  names,
  shas,
}: {
  order: { id: string; status: string; service: string };
  files: FileVersionRow[];
  role: string;
  names: Map<string, string>;
  shas: Map<string, string>;
}) {
  const rows = visibleFiles(order, files, role);
  const ready = rows.some((r) => r.grant === "ALLOW" && ["STL", "RHINO_3DM", "SUMMARY_SHEET"].includes(r.f.kind));
  return (
    <div className="space-y-2">
      {!ready && (
        <p className="text-[length:var(--fs-2)] text-muted-foreground">STL, 3DM and the summary sheet unlock when you approve the design.</p>
      )}
      {POST_QC.includes(order.status) && order.service !== "render" && (
        <p className="flex flex-wrap gap-3 text-[length:var(--fs-2)]">
          <a href={`/api/orders/${order.id}/certificate`} className="underline underline-offset-4">
            QC certificate (PDF)
          </a>
          <a href={`/api/orders/${order.id}/weight-sheet`} className="underline underline-offset-4">
            Weight sheet (PDF)
          </a>
        </p>
      )}
      <ul className="divide-y divide-border">
        {rows.map(({ f, grant }) => {
          const [what, how] = KIND_WORDS[f.kind] ?? ["File", ""];
          return (
            <li key={f.id} className="flex items-center justify-between gap-3 py-[var(--s-2)]">
              <span className="min-w-0">
                <span className="block text-[length:var(--fs-3)]">
                  {what}
                  <span className="ml-1.5 text-[length:var(--fs-2)] text-muted-foreground">v{f.version_no}</span>
                </span>
                <span className="block truncate text-[length:var(--fs-1)] text-muted-foreground">
                  {[names.get(f.id), how, fileSize(f.size_bytes)].filter(Boolean).join(" · ")}
                </span>
                {shas.get(f.id) && (
                  <span className="block truncate font-mono text-[length:var(--fs-1)] text-muted-foreground" title={shas.get(f.id)}>
                    SHA-256 {shas.get(f.id)!.slice(0, 16)}…
                  </span>
                )}
              </span>
              {grant === "ALLOW" ? (
                <a href={`/api/files/${f.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Download
                </a>
              ) : (
                <span className="text-[length:var(--fs-2)] text-muted-foreground">Locked</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
