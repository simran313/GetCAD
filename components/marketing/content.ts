/**
 * The website's words (docs/marketing/LANDING-COPY.md, prices from
 * docs/DECISIONS.md §4). Kept as data so the pages, the FAQ and the tests
 * read one copy. No stats, client logos or customer quotes until real ones
 * exist (LANDING-COPY placeholders; DECISIONS §12 public_stats off).
 */

export const PROOF = [
  "First look in 6 hours, or it's free",
  "Every file checked twice: 19 points, two designers",
  "From $35 a design. Retainers for regular orders.",
];

export const STEPS: [string, string][] = [
  ["Send the brief.", "Sketch, photo or reference, plus size, metal and stones. Two minutes."],
  ["Get a price within the hour.", "Fixed bands, no surprises."],
  ["Pay, and we confirm the brief.", "The clock starts once your order is confirmed: first look within 6 hours for standard pieces."],
  ["Approve or ask for changes.", "Two revision rounds included."],
  ["Download your files.", "3DM, STL, renders, spec sheet and weight sheet."],
];

export const DELIVERABLES = [
  "3DM + STL, ready for printing and casting",
  "3 render views",
  "A signed spec sheet: walls, prongs, stone seats, size",
  "A weight sheet in 10K, 14K, 18K, platinum and silver",
  "A 3D preview link with your logo, to send your customer",
];

export const GUARANTEES: [string, string][] = [
  [
    "First look in 6 hours, or it's free.",
    "For standard pieces, if we don't share your first look within 6 hours of order confirmation, the full amount comes back as credit — and we still finish the job.",
  ],
  [
    "Castable files, guaranteed to spec.",
    "Every file ships with a signed spec sheet. If a file breaks its own spec, we fix it free and refund the CAD fee.",
  ],
  [
    "Your work stays yours.",
    "White-label. NDA by default. You own the files once paid. Our designers never see your customer.",
  ],
];

export const AUDIENCES = [
  "Custom and bridal jewelers who want to show customers a CAD the same day",
  "Manufacturers and trade shops with more CAD work than designers",
  "Brands and wholesalers launching new collections",
];

export const INCLUDED = "3DM + STL · 3 renders · spec sheet · weight sheet · 3D preview link · 2 revision rounds within 14 days";

export const FAQ: [string, string][] = [
  [
    "Where are you based?",
    "Our studio is in Mumbai, India. The portal is open 24/7 and our AI works around the clock; a person answers calls and WhatsApp 5:30 AM – 2:30 PM ET (4:30 AM – 1:30 PM in US winter), every day.",
  ],
  [
    "How fast is it really?",
    "A first look within 6 hours of order confirmation, bulk orders included, or it's free. Our AI does the modelling; experts check every file, and 99% of first looks are right first time. Complex pieces get a firm deadline with the price.",
  ],
  ["What files do I get?", "3DM and STL, 3 renders, a signed spec sheet, a weight sheet and a 3D preview link."],
  ["Who owns the design?", "You do, once paid. White-label, with an NDA by default."],
  ["Can you work from a photo or a sketch?", "Yes. Add size, metal and stones and we'll price it within the hour."],
  ["What if I need changes?", "Two revision rounds are included within 14 days."],
  ["Do you work with consumers?", "No. We work only with jewelry businesses."],
];

/**
 * The 19-point checklist (build spec §8), as clients read it. The same lines
 * the designer and the second designer tick in the portal;
 * tests/db/marketing_checks.test.ts keeps the two in step.
 */
export const CHECK_GROUPS: { group: string; checks: string[] }[] = [
  {
    group: "Before starting",
    checks: [
      "Brief read — measurements, stone specs and special requirements noted",
      "Reference image open alongside the CAD — compare at every stage",
      "Metal and stone colour noted — matches the brief",
      "Unclear points flagged to ops before starting",
    ],
  },
  {
    group: "Dimensions",
    checks: [
      "Length correct",
      "Width and height / depth correct",
      "Size correct — ring inner diameter, bangle or bracelet circumference",
      "Shank — top width, bottom width, top depth, bottom depth match the brief",
    ],
  },
  {
    group: "Stones",
    checks: ["Centre stone seat matches brief dimensions", "Side stone count, size and placement match the brief"],
  },
  { group: "Geometry", checks: ["No open or naked edges — all geometry closed"] },
  {
    group: "3DM file",
    checks: [
      "Delivery views captured — TV, PV, RV, FV, BV, M, DD, GW",
      "Folder renamed for QC — follows the naming convention",
    ],
  },
  {
    group: "STL",
    checks: [
      "Magic file applied and Ctrl+T executed",
      "Naked edge check passed before export",
      "Mesh all files — max distance / edge = 0.005",
    ],
  },
  {
    group: "Final",
    checks: [
      "Special requirements fulfilled — order notes re-read before submitting",
      "Both 3DM and STL uploaded to the correct folder",
      "Signed off — by the designer, then by the second designer",
    ],
  },
];

export const PRODUCTS = ["Ring", "Band", "Pendant", "Earrings", "Bracelet", "Bangle", "Necklace", "Other"];
