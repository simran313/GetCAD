/**
 * The website's words (docs/marketing/LANDING-COPY.md, prices from
 * docs/DECISIONS.md §4). Kept as data so the pages, the FAQ and the tests
 * read one copy. No stats, client logos or customer quotes until real ones
 * exist (LANDING-COPY placeholders; DECISIONS §12 public_stats off).
 */

export const PROOF = [
  "First look in 6 hours, or it's free",
  "Every file checked twice: two-stage QC, designer then QC manager",
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
 * The two-stage QC (owner's QC sheet, 1 Nov 2026; DECISIONS §10), as clients
 * read it: the designer's check, then the QC manager's. The same lines the
 * portal marks Pass or Fail; tests/db/marketing_checks.test.ts keeps the two
 * in step.
 */
export const CHECK_GROUPS: { group: string; checks: string[] }[] = [
  {
    group: "Designer check",
    checks: [
      "Size and all measurements",
      "Diamond sizes, colours and count",
      "Setting type",
      "Metal colour and karat",
      "Client's special remarks",
      "Overall design look, every measurement marked",
      "No open or naked edges",
      "STL mesh",
      "Files exported",
    ],
  },
  {
    group: "QC manager check",
    checks: [
      "Overall design look",
      "Diamond sizes, shapes and colours",
      "All measurements",
      "Setting type, metal colour and karat",
      "Client's special remarks",
    ],
  },
];

export const PRODUCTS = ["Ring", "Band", "Pendant", "Earrings", "Bracelet", "Bangle", "Necklace", "Other"];
