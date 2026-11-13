#!/usr/bin/env node
/**
 * Copies the guide screenshots from a Design QA capture into
 * docs/guides/assets/screens, cropped and compressed.
 *
 *   node docs/guides/screens.mjs <stage folder>
 *
 * <stage folder> is one stage of the design-qa branch, for example the
 * "guide" folder after `git archive origin/design-qa guide | tar -x -C /tmp/qa`
 * (so /tmp/qa/guide). It holds guide/<name>.png from tests/design-qa/guide.qa.ts
 * and <who>/<route>@<width>.png from tests/design-qa/screens.qa.ts.
 *
 * Every image comes from the throwaway e2e stack (fictional data). Look at each
 * one before committing it.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "assets/screens");

/**
 * name → source inside the stage folder, and an optional crop in source
 * pixels ({ left, top, width, height }; height may exceed the image, it is clamped).
 * SIDE = 240 px skips the computer sidebar so the content prints larger.
 */
const SIDE = 240;
const DESK = (h = 900) => ({ left: 0, top: 0, width: 1440, height: h });
const MAIN = (h = 1200, top = 0) => ({ left: SIDE, top, width: 1440 - SIDE, height: h });
export const SHOTS = {
  // Admin
  "admin-queue": ["guide/admin-queue.png", DESK(700)],
  "admin-user-menu": ["guide/admin-user-menu.png", { left: 0, top: 560, width: 520, height: 340 }],
  "admin-notifications": ["guide/admin-notifications.png", { left: 880, top: 0, width: 560, height: 700 }],
  "admin-command-palette": ["guide/admin-command-palette.png", { left: 360, top: 60, width: 720, height: 560 }],
  "admin-phone-queue": ["guide/admin-phone-queue.png"],
  "pod-phone-qc": ["guide/pod-phone-qc.png"],
  "client-phone-order": ["guide/client-phone-order.png"],
  "designer-phone-job": ["guide/designer-phone-job.png"],
  "admin-orders": ["guide/admin-orders.png", MAIN(760)],
  "admin-new-order": ["guide/admin-new-order.png", MAIN(1500)],
  "admin-order-quote": ["guide/admin-order-quote.png", MAIN(760)],
  "admin-order-mark-paid": ["guide/admin-order-mark-paid.png", MAIN(900)],
  "admin-order-ready-to-assign": ["guide/admin-order-ready-to-assign.png", MAIN(1200)],
  "admin-order-with-designer": ["guide/admin-order-with-designer.png", MAIN(1200)],
  "admin-order-delivered": ["guide/admin-order-delivered.png", MAIN(1150)],
  "admin-access": ["guide/admin-access.png", MAIN(800)],
  "admin-access-row-menu": ["guide/admin-access-row-menu.png", { left: 840, top: 120, width: 600, height: 460 }],
  "admin-access-suspend-dialog": ["guide/admin-access-suspend-dialog.png", { left: 420, top: 200, width: 600, height: 420 }],
  "admin-pods": ["guide/admin-pods.png", MAIN(1300)],
  "admin-designers": ["guide/admin-designers.png", MAIN(1000)],
  "admin-designer-detail": ["guide/admin-designer-detail.png", MAIN(1500)],
  "admin-clients": ["guide/admin-clients.png", MAIN(1200)],
  "admin-settings": ["guide/admin-settings.png", MAIN(1400)],
  "admin-payouts": ["guide/admin-payouts.png", MAIN(900)],
  "admin-billing": ["guide/admin-billing.png", MAIN(900)],
  "admin-credits": ["guide/admin-credits.png", MAIN(800)],
  "admin-messages-order": ["guide/admin-messages-order.png", DESK(900)],
  // Pod lead
  "pod-qc-queue": ["guide/pod-qc-queue.png", DESK(800)],
  "pod-board-job-actions": ["guide/pod-board-job-actions.png", MAIN(1100)],
  "pod-order-assign": ["guide/pod-order-assign.png", MAIN(1000)],
  "pod-qc-review": ["podLead/qc_QvLjjXfXqGfq6df4qdKrq@1440.png", MAIN(1150)],
  // Designer
  "designer-home": ["guide/designer-home.png", DESK(900)],
  "designer-job": ["guide/designer-job.png", MAIN(1500)],
  "designer-render-composer": ["guide/designer-render-composer.png", { left: 300, top: 0, width: 840, height: 900 }],
  "designer-final-review": ["guide/designer-final-review.png", DESK(900)],
  // Client
  "client-home": ["guide/client-home.png", DESK(900)],
  "client-new-order": ["guide/client-new-order.png", DESK(900)],
  "client-pay": ["client2/orders_aMqJQd3ddMLKCGzWy5kvT_pay@1440.png", MAIN(720)],
  "client-order-working": ["guide/client-order-working.png", MAIN(1400)],
  "client-order-delivered": ["guide/client-order-delivered.png", MAIN(1420)],
  "client-order-menu": ["guide/client-order-menu.png", { left: 840, top: 40, width: 600, height: 380 }],
  "client-files": ["guide/client-files.png", MAIN(820)],
  "client-messages": ["guide/client-messages.png", DESK(900)],
};

export async function prepare(stage, only = []) {
  mkdirSync(OUT, { recursive: true });
  const missing = [];
  for (const [name, [src, crop]] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    const from = join(stage, src);
    if (!existsSync(from)) {
      missing.push(`${name} (${src})`);
      continue;
    }
    let img = sharp(from);
    if (crop) {
      const meta = await img.metadata();
      const left = Math.min(crop.left, meta.width - 1);
      const top = Math.min(crop.top, meta.height - 1);
      img = img.extract({ left, top, width: Math.min(crop.width, meta.width - left), height: Math.min(crop.height, meta.height - top) });
    }
    await img
      .resize({ width: 1400, withoutEnlargement: true })
      .png({ palette: true, quality: 92, compressionLevel: 9 })
      .toFile(join(OUT, `${name}.png`));
    console.log(`  ${name}`);
  }
  if (missing.length) console.warn(`missing in ${stage}:\n  ${missing.join("\n  ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [stage, ...only] = process.argv.slice(2);
  if (!stage) {
    console.error("usage: node docs/guides/screens.mjs <design-qa stage folder> [name …]");
    process.exit(1);
  }
  await prepare(stage, only);
}
