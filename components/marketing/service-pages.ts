import { c } from "@/content/claims";

/**
 * The service and guide pages (AI search, phase 2, 15 Nov 2026), one per
 * search intent (docs/SEO.md keyword map). Every fact is one the website
 * already states (content/claims.ts, components/marketing/content.ts) or the
 * owner confirmed for these pages (docs/DECISIONS.md 1.29: render-only from
 * $15, repair quoted after review, Rhino / MatrixGold / ZBrush). The internal
 * price bands stay internal (DECISIONS §4).
 */
export interface ServicePageContent {
  path: string;
  /** Breadcrumb and link name. */
  name: string;
  eyebrow: string;
  h1: string;
  /** Two sentences that answer the search on their own. */
  answer: string;
  cta?: { href: string; label: string };
  secondary?: { href: string; label: string };
  facts: [string, string][];
  sections: { title: string; answer: string; points?: string[]; table?: { head: string[]; rows: string[][] } }[];
  faqTitle: string;
  faq: [string, string][];
  related: { href: string; label: string }[];
  closing?: string;
  /** Structured data: the page's own service, when it is not the CAD service itself. */
  service?: { name: string; description: string; lowPrice?: string };
}

const PRICE = c("ENTRY_PRICE");
const HOURS = c("FIRST_LOOK_HOURS");
const RENDER = c("RENDER_ONLY_PRICE");
const REVISIONS = c("REVISIONS");
const SOFTWARE = c("SOFTWARE");
const DESIGNERS = c("DESIGNER_COUNT");
const YEARS = c("MIN_EXPERIENCE_YEARS");

const QUOTE = { href: "/contact", label: "Ask for a quote" };
const START = { href: "/sign-up", label: "Start your first design" };
const PRICING = { href: "/pricing", label: "See pricing" };

const FILES = `3DM + STL, render views, a signed spec sheet, a weight sheet in 10K, 14K, 18K, platinum and silver, and a 3D preview link`;

export const SERVICE_PAGES = {
  engagementRing: {
    path: "/engagement-ring-cad",
    name: "Engagement ring CAD",
    eyebrow: "Engagement ring CAD for jewelers",
    h1: "Engagement ring CAD, first look in 6 hours.",
    answer: `The CAD Pillar models custom engagement rings for jewelers from a sketch, photo or reference: castable 3DM and STL files with stone seats cut to your stones, from ${PRICE} a design. A first look comes within ${HOURS} hours of order confirmation for standard pieces, so you can show your customer a CAD the same day.`,
    cta: START,
    secondary: PRICING,
    facts: [
      ["Price", `From ${PRICE} a design; halo, pavé and sculpted rings quoted within the hour`],
      ["First look", `Within ${HOURS} hours of order confirmation (standard pieces), or it's free`],
      ["Files", FILES],
      ["Revisions", REVISIONS],
      ["Software", SOFTWARE],
      ["Who it's for", "Bridal and custom jewelers, retailers and manufacturers. Not consumers."],
    ],
    sections: [
      {
        title: "Which engagement rings can you model?",
        answer:
          "Solitaires, halos, three-stone and side-stone rings, pavé and micro-pavé bands, cathedral and bypass shanks, hidden halos and matching wedding bands, as CAD for casting or 3D printing.",
        points: [
          "Center stone in any shape and setting: prongs, bezel or as in your reference image",
          "Side stones sized one by one, or scaled to the center stone",
          "Ring size from about 40 national size charts, US first; the inside diameter is worked out from the size, or made to your own measurement",
          "A certified center stone can carry pictures of its certificate, so the seat is cut to the real stone",
        ],
      },
      {
        title: "What do I send to start?",
        answer:
          "A sketch, photo or reference image, plus the ring size, metal and stones. It takes about two minutes in the portal, and you get a fixed price within the hour before you pay anything.",
        points: [
          "Mark up any reference picture with a circle, a pen or numbered pins to show exactly what to change",
          "Write your factory's standing rules once (minimum walls, prong sizes, sprue notes); every designer sees them on every order",
        ],
      },
      {
        title: "Is the CAD ready to cast?",
        answer:
          "Yes. Every file passes two checks, the designer's and then the QC manager's: measurements, diamond sizes and count, setting, metal and karat, open edges and the STL mesh. It ships with a signed spec sheet, and if a file breaks its own spec we fix it free and refund the CAD fee.",
      },
    ],
    faqTitle: "Engagement ring CAD: common questions",
    faq: [
      [
        "How much does engagement ring CAD cost?",
        `From ${PRICE} a design for standard rings such as solitaires and simple bands. Halo, pavé, multi-stone and sculpted rings get a fixed quote within the hour, before you pay.`,
      ],
      [
        "How fast can I show my customer the ring?",
        `A first look comes within ${HOURS} hours of order confirmation for standard pieces, or it's free. You also get a 3D preview link with your logo to send your customer.`,
      ],
      ["Do you design for consumers?", "No. We work only with jewelry businesses: jewelers, retailers, brands and manufacturers."],
      ["Who owns the ring design?", "You do, once paid. White-label, with an NDA by default; our designers never see your customer."],
      ["Which file formats do I get?", `3DM (Rhino) and STL, plus render views, a spec sheet and a weight sheet. We model in ${SOFTWARE}.`],
    ],
    related: [
      { href: "/sketch-to-cad", label: "Sketch or photo to CAD" },
      { href: "/jewelry-rendering", label: "Jewelry rendering" },
      { href: "/jewelry-cad-cost", label: "What jewelry CAD costs" },
      { href: "/quality", label: "How every file is checked" },
    ],
    closing: "Send one ring. If you don't see the first look within 6 hours, it's free.",
  },

  forJewelers: {
    path: "/for-jewelers",
    name: "Jewelry CAD for jewelers",
    eyebrow: "White-label CAD outsourcing",
    h1: "Outsource your jewelry CAD, under your name.",
    answer: `The CAD Pillar is a white-label jewelry CAD team for jewelers, retailers, brands and manufacturers: send a brief in the portal, get a fixed price within the hour and a first look within ${HOURS} hours for standard pieces, from ${PRICE} a design. Files carry your naming, never ours, under an NDA by default.`,
    cta: START,
    secondary: { href: "/contact", label: "Talk to us about volume" },
    facts: [
      ["Team", `${DESIGNERS} senior CAD designers, ${YEARS} years each in production CAD`],
      ["Price", `From ${PRICE} a design; retainers for regular orders`],
      ["First look", `Within ${HOURS} hours of order confirmation (standard pieces), bulk orders included`],
      ["Confidentiality", "White-label, NDA by default, you own the files once paid"],
      ["Working from the US", "Prices in US dollars; portal open 24/7; a person on calls and WhatsApp " + c("LIVE_CALL_HOURS")],
      ["Files", FILES],
    ],
    sections: [
      {
        title: "Why do jewelers outsource CAD?",
        answer:
          "To show customers a design the same day without hiring, to cover rush weeks and trade shows, and to keep their own CAD designers on the pieces only they can do. We work as overflow, for rush weeks, or for every order.",
        points: [
          "Custom and bridal jewelers who want to show a customer a CAD the same day",
          "Manufacturers and trade shops with more CAD work than designers",
          "Brands and wholesalers launching new collections",
        ],
      },
      {
        title: "How does white-label work?",
        answer:
          "Your customer never learns we exist. Files are named for you, the 3D preview link carries your logo, and our designers never see who you or your customer are.",
      },
      {
        title: "How do regular orders work?",
        answer:
          "Order by order in the portal, or on a retainer: a monthly rate, a named account manager and priority in the queue. Your factory's standing rules are written once and shown to every designer on every order.",
      },
    ],
    faqTitle: "Outsourcing jewelry CAD: common questions",
    faq: [
      [
        "Can you be a white-label CAD partner for my store or factory?",
        "Yes. Files carry your naming, never ours, and we work under NDA by default. Our designers never see who you or your customer are.",
      ],
      ["Do you work with jewelers in the United States?", "Yes. We work remotely with jewelry businesses across the United States, and in the UK, Australia and Canada. Prices are in US dollars, and live support hours are shown in US Eastern time."],
      ["Where are you based?", "Our studio is in Mumbai, India. The portal is open 24/7; a person answers calls and WhatsApp " + c("LIVE_CALL_HOURS") + ", every day."],
      ["Can you match our existing CAD standards?", "Yes. Write your standing rules once on your account and every designer sees them on every order, alongside the brief."],
    ],
    related: [
      { href: "/how-it-works", label: "How jewelry CAD outsourcing works" },
      { href: "/compare", label: "CAD service vs freelancers vs in-house" },
      { href: "/pricing", label: "Pricing and retainers" },
      { href: "/guarantee", label: "Our guarantees" },
    ],
  },

  rendering: {
    path: "/jewelry-rendering",
    name: "Jewelry rendering",
    eyebrow: "Jewelry rendering service",
    h1: "Photo-real jewelry renders, from your own CAD.",
    answer: `Send your existing 3DM or STL and The CAD Pillar makes photo-real jewelry renders from ${RENDER} a design, without any CAD work. Every CAD order we model also includes render views.`,
    cta: QUOTE,
    secondary: { href: "/jewelry-cad", label: "Need the CAD too?" },
    facts: [
      ["Price", `From ${RENDER} a design for renders of your own file`],
      ["What we need", "Your 3DM or STL, plus metal color and stones"],
      ["What sets the price", "Complexity, materials, stone detail and the views you need"],
      ["With a CAD order", "Render views are included with every design we model"],
    ],
    sections: [
      {
        title: "Can I order renders without a CAD order?",
        answer: `Yes. Send a 3DM or STL made by anyone and we render it, from ${RENDER} a design. The price is fixed before you pay and depends on complexity, materials, stone detail and the views you need.`,
      },
      {
        title: "What are jewelry renders used for?",
        answer:
          "Approving a design with a customer before casting, product pages and catalogues for a new collection, and social posts before the piece exists.",
      },
      {
        title: "What does a render from a CAD order include?",
        answer:
          "Every design we model comes with render views to approve, plus a 3D preview link with your logo that your customer can turn in the browser.",
      },
    ],
    faqTitle: "Jewelry rendering: common questions",
    faq: [
      ["How much does jewelry rendering cost?", `From ${RENDER} a design for renders of your own 3DM or STL. You get a fixed price before you pay.`],
      ["Which files can you render?", "3DM (Rhino, MatrixGold) and STL."],
      ["Can you render a file another designer made?", "Yes. If the file has problems, we can also repair it; see CAD file repair."],
      ["Who owns the renders?", "You do, once paid. White-label, with an NDA by default."],
    ],
    related: [
      { href: "/cad-file-repair", label: "CAD file repair" },
      { href: "/jewelry-stl-3dm-files", label: "STL and 3DM files" },
      { href: "/jewelry-cad", label: "Jewelry CAD services" },
    ],
    service: {
      name: "Jewelry rendering",
      description: `Photo-real jewelry renders from the client's own 3DM or STL, from ${RENDER} a design; render views are included with every CAD order.`,
      lowPrice: RENDER.replace("$", ""),
    },
  },

  files: {
    path: "/jewelry-stl-3dm-files",
    name: "STL and 3DM files",
    eyebrow: "Files for casting and 3D printing",
    h1: "Jewelry STL and 3DM files, ready to print and cast.",
    answer: `Every design from The CAD Pillar comes as a Rhino 3DM you can edit and an STL ready for 3D printing and casting, with a signed spec sheet and a weight sheet. From ${PRICE} a design, first look within ${HOURS} hours for standard pieces.`,
    cta: START,
    secondary: PRICING,
    facts: [
      ["Formats", "3DM (Rhino) and STL with every design"],
      ["Checked", "No open or naked edges; STL mesh checked before delivery"],
      ["Spec sheet", "Walls, prongs, stone seats and size, signed"],
      ["Weight sheet", "Estimated grams in 10K, 14K, 18K, platinum and silver"],
      ["Software", SOFTWARE],
      ["Ownership", "Yours once paid; white-label, NDA by default"],
    ],
    sections: [
      {
        title: "What is the difference between 3DM and STL?",
        answer:
          "A 3DM is the editable Rhino model, which MatrixGold also opens: curves, surfaces and solids you can change later. An STL is a triangle mesh that printers and casting houses read; it cannot be edited like a model and carries no units, so it is exported at true size.",
        table: {
          head: ["", "3DM", "STL"],
          rows: [
            ["What it is", "Editable Rhino model (surfaces and solids)", "Triangle mesh"],
            ["Used for", "Changes, resizing, new versions", "3D printing and casting"],
            ["Opens in", "Rhino, MatrixGold", "Any slicer or printer software"],
            ["Comes with every design", "Yes", "Yes"],
          ],
        },
      },
      {
        title: "Are the files ready to cast?",
        answer:
          "Yes. Both checks, the designer's and then the QC manager's, cover measurements, stones, setting, metal and karat; the designer also checks for open or naked edges and the STL mesh before exporting. If a file breaks its own spec sheet, we fix it free and refund the CAD fee.",
      },
      {
        title: "Can you fix an STL or 3DM from another designer?",
        answer: "Yes. We inspect, repair and optimize files made elsewhere; the price is set after we review the file.",
      },
    ],
    faqTitle: "STL and 3DM files: common questions",
    faq: [
      ["Which file formats do I get?", "3DM and STL with every design, plus render views, a signed spec sheet, a weight sheet and a 3D preview link."],
      ["Which software do you use?", `${SOFTWARE}, chosen for the design and its manufacturing spec.`],
      ["Who owns the files?", "You do, once paid."],
    ],
    related: [
      { href: "/cad-file-repair", label: "CAD file repair" },
      { href: "/quality", label: "How every file is checked" },
      { href: "/engagement-ring-cad", label: "Engagement ring CAD" },
    ],
  },

  sketch: {
    path: "/sketch-to-cad",
    name: "Sketch to CAD",
    eyebrow: "From sketch or photo to CAD",
    h1: "Turn a jewelry sketch or photo into CAD.",
    answer: `Send a sketch, photo or reference with the size, metal and stones; The CAD Pillar prices it within the hour and models it as castable 3DM and STL files, from ${PRICE} a design. A first look comes within ${HOURS} hours of order confirmation for standard pieces.`,
    cta: START,
    secondary: { href: "/how-it-works", label: "How it works" },
    facts: [
      ["You send", "A sketch, photo or reference, plus size, metal and stones"],
      ["Price", `Fixed within the hour, from ${PRICE}; you pay only when you accept it`],
      ["First look", `Within ${HOURS} hours of order confirmation (standard pieces), or it's free`],
      ["Changes", REVISIONS],
    ],
    sections: [
      {
        title: "Does a hand sketch work?",
        answer:
          "Yes. A phone photo of a sketch is enough. Add the measurements you know; anything missing, we ask for before modeling, so the price and the first look are right.",
      },
      {
        title: "How do I ask for changes?",
        answer: `Draw on the render: circle an area, use a pen or drop numbered pins, and say what to change. ${REVISIONS[0]!.toUpperCase()}${REVISIONS.slice(1)} are included.`,
      },
      {
        title: "Can you copy a piece from a photo?",
        answer:
          "We model from photos and references you have the right to use. Tell us what to keep and what to change; the finished design and its files are yours once paid.",
      },
    ],
    faqTitle: "Sketch to CAD: common questions",
    faq: [
      ["Can you work from a photo or a sketch?", "Yes. Add size, metal and stones and we'll price it within the hour."],
      ["What do you need from me to start?", "A sketch, photo or reference image, plus the size, metal and stones."],
      ["What if I need changes?", `${REVISIONS[0]!.toUpperCase()}${REVISIONS.slice(1)} are included.`],
    ],
    related: [
      { href: "/engagement-ring-cad", label: "Engagement ring CAD" },
      { href: "/jewelry-cad-cost", label: "What jewelry CAD costs" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },

  cost: {
    path: "/jewelry-cad-cost",
    name: "Jewelry CAD cost",
    eyebrow: "Guide · updated November 2026",
    h1: "How much does jewelry CAD cost?",
    answer: `At The CAD Pillar, jewelry CAD starts at ${PRICE} a design for standard pieces, with a fixed price within the hour before you pay; complex and sculpted pieces are quoted. Renders of your own file start at ${RENDER}, and repairs of other designers' files are quoted after review.`,
    cta: START,
    secondary: PRICING,
    facts: [
      ["CAD design", `From ${PRICE} a design (standard pieces)`],
      ["Complex and sculpted", "Fixed quote within the hour, before you pay"],
      ["Renders of your file", `From ${RENDER} a design`],
      ["File repair", "Quoted after we review the file"],
      ["Regular orders", "Retainers: a monthly rate, a named account manager, priority"],
      ["Included", REVISIONS + "; 3DM + STL, renders, spec and weight sheets"],
    ],
    sections: [
      {
        title: "What makes a jewelry CAD cost more?",
        answer:
          "The work in the model: how many stones and seats, pavé and halos, multi-part pieces, and sculpted or figurative detail. A plain band or solitaire is a standard piece; a pavé halo or a sculpted signet takes longer and is quoted.",
        points: [
          "Stone count and setting (pavé, micro-pavé, halos)",
          "Sculpted or organic surfaces (modeled in ZBrush)",
          "Multi-part pieces such as bracelets and hinged designs",
          "Missing measurements, which add questions before modeling starts",
        ],
      },
      {
        title: "How do I keep the cost down?",
        answer:
          "Send a complete brief: size, metal, karat and stones, with a clear reference. Reuse a past order as the starting point for a variation, and write your factory's standing rules once so nothing is redone.",
      },
      {
        title: "Is there a setup fee or a minimum order?",
        answer: "No. No setup fees and no minimum: order one design or hundreds. Retainers are for jewelers who order every week.",
      },
    ],
    faqTitle: "Jewelry CAD cost: common questions",
    faq: [
      ["How much does a ring CAD cost?", `From ${PRICE} a design for standard rings; halo, pavé and sculpted rings are quoted within the hour.`],
      ["Do I pay before I see the price?", "No. You get a fixed price within the hour and pay only when you accept it."],
      ["Are revisions extra?", `No. ${REVISIONS[0]!.toUpperCase()}${REVISIONS.slice(1)} are included.`],
      ["What does a render cost?", `Render views come with every CAD order. Renders of your own 3DM or STL start at ${RENDER} a design.`],
    ],
    related: [
      { href: "/pricing", label: "Pricing and retainers" },
      { href: "/compare", label: "CAD service vs freelancers vs in-house" },
      { href: "/jewelry-rendering", label: "Jewelry rendering" },
    ],
  },

  compare: {
    path: "/compare",
    name: "Compare jewelry CAD options",
    eyebrow: "Guide · updated November 2026",
    h1: "Jewelry CAD service, freelancers or in-house?",
    answer: `A CAD service suits jewelers who want a fixed price, a set turnaround and checked files without hiring; a freelancer can suit a one-off simple piece; an in-house designer suits a shop with steady, full-time CAD work. The CAD Pillar is a CAD service: from ${PRICE} a design, first look within ${HOURS} hours for standard pieces.`,
    cta: START,
    secondary: { href: "/for-jewelers", label: "Outsourcing with us" },
    facts: [
      ["Choose a CAD service if", "you want fixed prices, a set turnaround, two-stage QC and no hiring"],
      ["Choose a freelancer if", "you have a one-off, simple piece and time to manage the back-and-forth"],
      ["Choose in-house if", "you have full-time CAD work every week and want a designer at your bench"],
    ],
    sections: [
      {
        title: "How do the three options compare?",
        answer: "The differences are price certainty, speed, who checks the file, and who manages the work.",
        table: {
          head: ["", "The CAD Pillar", "Freelance platforms", "In-house designer"],
          rows: [
            ["Price", `From ${PRICE} a design, fixed before you pay`, "Set by each seller; varies widely", "A salary plus software licenses, every month"],
            ["Speed", `First look within ${HOURS} hours (standard), or it's free`, "Depends on the seller's queue", "Depends on your designer's workload"],
            ["Checking", "Two-stage QC: designer, then QC manager", "Up to the seller", "Up to you"],
            ["Files", "3DM + STL, renders, spec and weight sheets, preview link", "Varies by seller", "Whatever your process sets"],
            ["If a file is wrong", "Fixed free and the CAD fee refunded, if it breaks its spec", "The platform's dispute process", "Your designer's time"],
            ["Confidentiality", "White-label, NDA by default", "Varies by seller", "Your own staff"],
            ["Capacity", `${DESIGNERS} senior designers; bulk orders included`, "One person at a time", "Your headcount"],
          ],
        },
      },
      {
        title: "When is a freelancer the better choice?",
        answer:
          "When the piece is simple, the deadline is loose, and you have time to brief, chase and check the file yourself. For anything a caster depends on, check who reviews the file before it reaches the bench.",
      },
      {
        title: "When is in-house the better choice?",
        answer:
          "When you have full-time CAD work every week and want a designer at your bench. Many shops keep one in-house designer and send overflow and rush weeks to a CAD service.",
      },
    ],
    faqTitle: "Choosing a jewelry CAD option: common questions",
    faq: [
      ["Can I use a CAD service alongside my own designer?", "Yes. Jewelers use us for overflow and rush weeks with the same specs and their own naming."],
      ["Who owns the files from a CAD service?", "With The CAD Pillar, you do, once paid. White-label, with an NDA by default."],
      ["How do I test a CAD service?", `Send one design. The first is ${c("FIRST_DESIGN_PRICE")}, and if you don't see the first look within ${HOURS} hours, it's free.`],
    ],
    related: [
      { href: "/for-jewelers", label: "White-label CAD outsourcing" },
      { href: "/jewelry-cad-cost", label: "What jewelry CAD costs" },
      { href: "/guarantee", label: "Our guarantees" },
    ],
  },

  repair: {
    path: "/cad-file-repair",
    name: "CAD file repair",
    eyebrow: "Jewelry CAD file repair",
    h1: "Jewelry CAD file repair: STL and 3DM.",
    answer:
      "The CAD Pillar inspects, repairs and optimizes jewelry 3DM and STL files made by other designers: broken geometry, non-manifold meshes, structural defects and anything that stops a file printing or casting. The price is set after we review your file.",
    cta: QUOTE,
    secondary: { href: "/jewelry-stl-3dm-files", label: "About STL and 3DM" },
    facts: [
      ["Files", "3DM and STL made by any designer"],
      ["We fix", "Geometry problems, non-manifold meshes, structural defects, manufacturing readiness"],
      ["Price", "Quoted after we review the file"],
      ["Ownership", "Your file stays yours; NDA by default"],
    ],
    sections: [
      {
        title: "What problems can you repair?",
        answer:
          "Anything that stops a file printing, casting or holding together: open or naked edges, non-manifold and self-intersecting meshes, walls or prongs too thin to cast, stone seats that do not fit their stones, and exports at the wrong size.",
        points: [
          "Open or naked edges and holes in the mesh",
          "Non-manifold edges and inverted or duplicate faces",
          "Walls, prongs and seats checked against casting minimums",
          "A clean STL re-exported from the repaired model",
        ],
      },
      {
        title: "How does a repair work?",
        answer:
          "Send the file and tell us what went wrong (a failed print, a slicer error, a casting problem). We review it, give you a fixed price, repair it once you accept, and check it the same way as our own files.",
      },
      {
        title: "Can you also change the design?",
        answer: `Yes. Once the file is sound, design changes are priced like new CAD work, from ${PRICE} a design for standard pieces.`,
      },
    ],
    faqTitle: "CAD file repair: common questions",
    faq: [
      ["How much does it cost to repair an STL?", "It depends on what is wrong, so the price is set after we review the file. You see it before you pay."],
      ["Can you repair a file another designer made?", "Yes. That is what this service is for: 3DM and STL files from any designer."],
      ["Do you need the 3DM, or is the STL enough?", "Either works. With the 3DM we can repair the model itself; with only an STL we repair the mesh."],
    ],
    related: [
      { href: "/jewelry-stl-3dm-files", label: "STL and 3DM files" },
      { href: "/jewelry-rendering", label: "Jewelry rendering" },
      { href: "/quality", label: "How every file is checked" },
    ],
    service: {
      name: "Jewelry CAD file repair",
      description:
        "Inspection, repair and optimization of jewelry 3DM and STL files made by other designers: geometry, non-manifold meshes, structural defects and manufacturing readiness. Quoted after the file is reviewed.",
    },
  },
} as const satisfies Record<string, ServicePageContent>;

export const SERVICE_PAGE_LIST: readonly ServicePageContent[] = Object.values(SERVICE_PAGES);
