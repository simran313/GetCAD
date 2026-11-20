/**
 * Charts for the Sales Training Master. Each returns an SVG string drawn from
 * the document's own numbers (labels V/E/A kept). Marks carry data-tip for
 * the interactive edition; build.mjs screenshots the same SVG to PNG for Word.
 * Monochrome brand: near-black #0A0A0A, greys, white.
 */
const INK = "#0A0A0A", G1 = "#3F3F3F", G2 = "#7A7A7A", G3 = "#B5B5B5", G4 = "#E6E6E6", BG = "#FFFFFF";
const W = 1000;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const svg = (h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" font-family="Inter, Arial, sans-serif" role="img" aria-label="${esc(title)}"><rect width="${W}" height="${h}" fill="${BG}"/>${body}</svg>`;
const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 16}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? "start"}"${o.italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
const tip = (s) => ` data-tip="${esc(s)}"><title>${esc(s)}</title`;
const head = (t, sub) => text(40, 44, t, { size: 24, weight: 700 }) + (sub ? text(40, 72, sub, { size: 15, fill: G2 }) : "");
const rect = (x, y, w, h, fill, tipText, extra = "") =>
  `<rect class="mark" x="${x}" y="${y}" width="${Math.max(w, 0)}" height="${h}" fill="${fill}" rx="3"${extra}${tipText ? tip(tipText) + "></rect>" : "/>"}`;

/** Horizontal bars. rows: [{label, value, display, fill, note}] */
function hbars({ title, sub, rows, max, unit = "", labelW = 230, rowH = 34, foot }) {
  const top = 100, x0 = 40 + labelW, plotW = W - x0 - 140;
  const m = max ?? Math.max(...rows.map((r) => r.value));
  let b = head(title, sub);
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const w = (r.value / m) * plotW;
    b += text(x0 - 12, y + rowH * 0.62, r.label, { anchor: "end", size: 15 });
    b += rect(x0, y + 5, w, rowH - 10, r.fill ?? INK, r.tip ?? `${r.label}: ${r.display ?? r.value + unit}`);
    b += text(x0 + w + 8, y + rowH * 0.62, r.display ?? `${r.value}${unit}`, { size: 14, fill: G1 });
  });
  const h = top + rows.length * rowH + (foot ? 50 : 20);
  if (foot) b += text(40, h - 18, foot, { size: 13, fill: G2 });
  return svg(h, b, title);
}

function boxFlow(title, sub, steps, foot) {
  const top = 110, n = steps.length, gap = 26, bw = (W - 80 - gap * (n - 1)) / n, bh = 120;
  let b = head(title, sub);
  steps.forEach((s, i) => {
    const x = 40 + i * (bw + gap);
    b += rect(x, top, bw, bh, i === 0 ? INK : "#FFFFFF", `${s[0]}: ${s[1]}`, ` stroke="${INK}" stroke-width="2"`);
    b += text(x + bw / 2, top + 48, s[0], { anchor: "middle", weight: 700, size: 17, fill: i === 0 ? "#FFFFFF" : INK });
    const words = s[1].split(" ");
    let line = "", ly = top + 76;
    const lines = [];
    for (const w of words) { if ((line + " " + w).trim().length > 18) { lines.push(line.trim()); line = w; } else line += " " + w; }
    lines.push(line.trim());
    lines.forEach((l, k) => (b += text(x + bw / 2, ly + k * 18, l, { anchor: "middle", size: 13, fill: i === 0 ? "#DDDDDD" : G1 })));
    if (i < n - 1) b += `<path d="M${x + bw + 4} ${top + bh / 2} l${gap - 10} 0 m-8 -6 l8 6 l-8 6" stroke="${INK}" stroke-width="2.5" fill="none"/>`;
  });
  const h = top + bh + (foot ? 64 : 30);
  if (foot) b += text(40, h - 22, foot, { size: 13, fill: G2 });
  return svg(h, b, title);
}

export const CHARTS = {
  "cad-pipeline": () =>
    boxFlow("From brief to finished piece", "Our file is the master that real metal is made from", [
      ["1. Brief", "Sketch, photo, size, metal, stones"],
      ["2. CAD model", "3DM + STL built and checked twice"],
      ["3. Print", "Castable resin or wax"],
      ["4. Cast", "Gold, platinum or silver"],
      ["5. Bench", "Clean up, set stones, polish"],
    ], "TCP owns steps 1–2 (the file). Printing, casting and bench work are the client's or their caster's."),

  "ring-anatomy": () => {
    let b = head("Anatomy of a ring", "Side view, schematic");
    const cx = 420, cy = 400;
    b += `<ellipse class="mark" cx="${cx}" cy="${cy}" rx="150" ry="150" fill="none" stroke="${INK}" stroke-width="26"${tip("Shank: the band round the finger")}></ellipse>`;
    b += `<path class="mark" d="M${cx - 70} ${cy - 150} L${cx - 45} ${cy - 205} L${cx + 45} ${cy - 205} L${cx + 70} ${cy - 150} Z" fill="${G3}" stroke="${INK}" stroke-width="3"${tip("Gallery: the side profile under the head")}></path>`;
    b += `<path class="mark" d="M${cx - 60} ${cy - 205} L${cx} ${cy - 175} L${cx + 60} ${cy - 205} Z" fill="${G4}" stroke="${INK}" stroke-width="2"${tip("Stone seat: the cut-out where the stone sits")}></path>`;
    b += `<path class="mark" d="M${cx - 62} ${cy - 205} L${cx - 40} ${cy - 255} L${cx + 40} ${cy - 255} L${cx + 62} ${cy - 205} Z" fill="#FFFFFF" stroke="${INK}" stroke-width="3"${tip("Centre stone, held by the head")}></path>`;
    for (const dx of [-58, 58]) b += `<line class="mark" x1="${cx + dx}" y1="${cy - 205}" x2="${cx + dx * 0.72}" y2="${cy - 262}" stroke="${INK}" stroke-width="7" stroke-linecap="round"${tip("Prongs: metal claws that hold the stone")}></line>`;
    for (const dx of [-88, -76, 76, 88]) b += `<circle class="mark" cx="${cx + dx}" cy="${cy - 168}" r="7" fill="#FFFFFF" stroke="${INK}" stroke-width="2"${tip("Hidden halo: small stones under the centre stone")}></circle>`;
    const lab = (x1, y1, x2, y2, s) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${G2}" stroke-width="1.5"/>` + text(x2 + 8, y2 + 5, s, { size: 16, weight: 600 });
    b += lab(cx + 40, cy - 258, 640, 130, "Prongs");
    b += lab(cx + 10, cy - 235, 640, 175, "Centre stone (in the head)");
    b += lab(cx + 30, cy - 190, 640, 220, "Stone seat");
    b += lab(cx + 88, cy - 168, 640, 265, "Hidden halo");
    b += lab(cx + 66, cy - 160, 640, 310, "Gallery");
    b += lab(cx + 150, cy + 10, 640, 420, "Shank (band)");
    b += text(40, 610, "Halo: a ring of small stones around the centre stone. Pavé: many small stones set close together. Bezel: a metal rim instead of prongs.", { size: 13, fill: G2 });
    return svg(630, b, "Anatomy of a ring");
  },

  "brief-checklist": () => {
    const items = [
      ["Size + sizing system", "US 6 / UK L½ / EU 52"],
      ["Metal + karat", "14K yellow, 18K white, Pt950"],
      ["Stones", "Shape, size, count; centre vs side"],
      ["Setting style", "Prongs, bezel, pavé, halo"],
      ["References", "Sketch, photos, past design"],
      ["How it's made", "Casting or printing; caster needs"],
      ["File format", "3DM, STL or both"],
    ];
    let b = head("What a complete brief contains", "Ask for all seven in one message; one missing answer can cost a day");
    items.forEach((it, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 40 + col * 470, y = 100 + row * 82;
      b += rect(x, y, 450, 68, "#FFFFFF", `${it[0]}: ${it[1]}`, ` stroke="${INK}" stroke-width="1.5"`);
      b += `<circle cx="${x + 34}" cy="${y + 34}" r="18" fill="${INK}"/>` + text(x + 34, y + 40, String(i + 1), { anchor: "middle", fill: "#FFFFFF", weight: 700 });
      b += text(x + 66, y + 30, it[0], { weight: 700, size: 17 }) + text(x + 66, y + 52, it[1], { size: 14, fill: G1 });
    });
    return svg(440, b, "What a complete brief contains");
  },

  "buyer-funnel": () => {
    let b = head("Count buyers, not stores", "Businesses vs. real outsourcing buyers");
    const draw = (x, title, rows) => {
      b += text(x, 112, title, { size: 17, weight: 700 });
      const max = rows[0].v;
      rows.forEach((r, i) => {
        const y = 130 + i * 92, w = Math.max(Math.sqrt(r.v / max) * 420, 300);
        b += rect(x + (420 - w) / 2, y, w, 62, [INK, G1, G2][i], `${r.l}: ${r.d}`);
        b += text(x + 210, y + 30, r.d, { anchor: "middle", fill: "#FFFFFF", weight: 700, size: 18 });
        b += text(x + 210, y + 52, r.l, { anchor: "middle", fill: "#FFFFFF", size: 13 });
      });
    };
    draw(40, "14 study markets", [
      { l: "jewellery businesses (E)", v: 100000, d: "~100,000" },
      { l: "outsourcing buyers (E)", v: 12600, d: "~12,600" },
    ]);
    draw(540, "USA", [
      { l: "retailers, wholesalers, manufacturers (V)", v: 21831, d: "21,831" },
      { l: "outsourcing buyers (E)", v: 4550, d: "~4,550" },
      { l: "recurring, 5+ CAD jobs a month (E)", v: 1865, d: "~1,865" },
    ]);
    b += text(40, 430, "In the US, ~1,200 manufacturer and wholesaler buyers ≈ 64% of orders (E). Ten large accounts beat 300 independents.", { size: 14, fill: G1 });
    return svg(450, b, "Count buyers, not stores");
  },

  "market-size": () =>
    hbars({
      title: "Annual CAD outsourcing market by country (E)",
      sub: "US$ millions a year · 14-market study, Nov 2026 · total ~$142M",
      unit: "M",
      rows: [
        ["USA", 60], ["UK", 15], ["Germany", 13], ["Australia", 10], ["Canada", 9], ["France", 9], ["Italy", 9],
        ["Spain", 4], ["UAE", 3.7], ["Switzerland", 3.4], ["Netherlands", 3], ["Saudi Arabia", 2.3], ["New Zealand", 1],
      ].map(([label, value], i) => ({ label, value, display: `~$${value}M`, fill: i < 1 ? INK : i < 5 ? G1 : G2, tip: `${label}: ~$${value}M a year (E)` })),
      labelW: 150,
      foot: "Estimates (E). Darker bars: priority markets.",
    }),

  "country-priority": () =>
    hbars({
      title: "Country priority score (out of 25)",
      sub: "Where reps focus first",
      max: 25,
      rows: [
        ["USA", 20, "volume engine"], ["Australia", 20, "highest margin, time-zone fit"], ["UK", 19, ""], ["Canada", 18, "bolt-on to US"],
        ["Germany", 17, "needs German speaker; no cold email"], ["Netherlands", 16, ""], ["New Zealand", 16, ""], ["France", 15, ""],
        ["Switzerland", 14, ""], ["UAE", 13, "large manufacturers only"], ["Italy / Spain / Saudi", 12, "defer"], ["Hungary", 9, "not a target"],
      ].map(([label, value, note]) => ({ label, value, display: `${value}${note ? " · " + note : ""}`, fill: value >= 18 ? INK : value >= 15 ? G2 : G3, tip: `${label}: ${value}/25${note ? " — " + note : ""}` })),
      labelW: 200,
    }),

  seasonality: () => {
    let b = head("When US jewellery stores sell (V, older data)", "Share of annual US jewellery store sales");
    const parts = [["January–September", 65.3, G3], ["October–November", 15.0, G1], ["December", 19.7, INK]];
    let x = 40;
    parts.forEach(([l, v, f]) => {
      const w = (v / 100) * 920;
      b += rect(x, 110, w, 70, f, `${l}: ${v}% of annual sales`);
      b += text(x + w / 2, 152, `${v}%`, { anchor: "middle", fill: f === G3 ? INK : "#FFFFFF", weight: 700, size: 18 });
      b += text(x + w / 2, 210, l, { anchor: "middle", size: 14 });
      x += w;
    });
    b += text(40, 260, "October–December ≈ 34.7%; December alone ≈ 19.7%. Retail sends pause 11 Dec – 4 Jan.", { size: 15, weight: 600 });
    b += text(40, 288, "January–February is the volume trough: the best time to start pilots. Engagement season runs November–February.", { size: 14, fill: G1 });
    return svg(310, b, "When US jewellery stores sell");
  },

  "segment-scores": () =>
    hbars({
      title: "Segment fit score (out of 100)",
      sub: "Tier 1 black · Tier 2 grey · Tier 3 light (no outbound)",
      max: 100,
      rows: [
        ["Casting houses / trade shops / bureaus", 84, 1], ["Fine-jewellery manufacturers", 81, 1], ["CAD studios / freelancers (overflow)", 72, 2],
        ["Wholesalers / private-label", 69, 2], ["DTC / online bridal brands", 65, 2], ["Custom / bridal retailers (1–5 stores)", 60, 2],
        ["Bench jewellers", 45, 3], ["Small Etsy / Shopify sellers", 44, 3],
      ].map(([label, value, t]) => ({ label, value, display: `${value} · Tier ${t}`, fill: t === 1 ? INK : t === 2 ? G2 : G4, tip: `${label}: ${value}/100, Tier ${t}` })),
      labelW: 320,
    }),

  swimlane: () => {
    const lanes = ["Client", "Sales / AM", "Admin", "Pod lead", "Designer", "QC (pod lead)"];
    const steps = [
      [0, "Sends brief"], [1, "Coaches brief"], [2, "Category + quote"], [0, "Pays"], [2, "Confirms · clock starts"], [3, "Assigns designer"],
      [4, "Builds + 9-line check"], [5, "5-line QC check"], [0, "First look"], [0, "Approves / revises"], [2, "Releases files"], [1, "Credits offer · next job"],
    ];
    const top = 100, laneH = 66, x0 = 170, colW = (W - x0 - 20) / steps.length;
    let b = head("Order workflow", "Who does what, left to right · the 6-hour clock starts at step 5 (standard work)");
    lanes.forEach((l, i) => {
      const y = top + i * laneH;
      b += `<rect x="40" y="${y}" width="${W - 60}" height="${laneH}" fill="${i % 2 ? "#F5F5F5" : "#FFFFFF"}" stroke="${G4}"/>`;
      b += text(52, y + laneH / 2 + 5, l, { size: 14, weight: 700 });
    });
    let prev = null;
    steps.forEach(([lane, s], i) => {
      const cx = x0 + colW * i + colW / 2, cy = top + lane * laneH + laneH / 2;
      if (prev) b += `<line x1="${prev[0]}" y1="${prev[1]}" x2="${cx}" y2="${cy}" stroke="${G2}" stroke-width="1.5"/>`;
      prev = [cx, cy];
    });
    steps.forEach(([lane, s], i) => {
      const cx = x0 + colW * i + colW / 2, cy = top + lane * laneH + laneH / 2;
      b += `<circle class="mark" cx="${cx}" cy="${cy}" r="15" fill="${i === 4 ? INK : "#FFFFFF"}" stroke="${INK}" stroke-width="2"${tip(`Step ${i + 1} — ${lanes[lane]}: ${s}`)}></circle>`;
      b += text(cx, cy + 5, String(i + 1), { anchor: "middle", size: 13, weight: 700, fill: i === 4 ? "#FFFFFF" : INK });
    });
    const legendY = top + lanes.length * laneH + 34;
    steps.forEach(([lane, s], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      b += text(40 + col * 315, legendY + row * 24, `${i + 1}. ${s}`, { size: 13, fill: G1 });
    });
    return svg(legendY + 4 * 24 + 10, b, "Order workflow");
  },

  "sla-categories": () => {
    const cats = [["A", 15], ["B", 30], ["C", 45], ["D", 60], ["E", 90], ["F", 120], ["G", 180], ["H", 240], ["I", 300], ["J", 360], ["K", 420], ["L", 480]];
    const top = 110, base = 420, x0 = 80, bw = 62, gap = 7;
    let b = head("Job categories by design time", "A–F: first look within 6 hours of order confirmation · G–L: firm deadline stated with the price");
    cats.forEach(([c, m], i) => {
      const h = (m / 480) * (base - top), x = x0 + i * (bw + gap);
      b += rect(x, base - h, bw, h, i < 6 ? INK : G3, `Category ${c}: ${m} minutes · ${i < 6 ? "Standard: 6-hour first look" : "Complex: firm deadline with the price"}`);
      b += text(x + bw / 2, base - h - 8, `${m}m`, { anchor: "middle", size: 13, fill: G1 });
      b += text(x + bw / 2, base + 22, c, { anchor: "middle", weight: 700 });
    });
    b += `<line x1="${x0}" y1="${base}" x2="${x0 + 12 * (bw + gap)}" y2="${base}" stroke="${INK}"/>`;
    b += rect(x0, base + 40, 6 * (bw + gap) - gap, 30, INK) + text(x0 + (6 * (bw + gap)) / 2, base + 60, "Standard · 6-hour first look or full credit", { anchor: "middle", fill: "#FFFFFF", size: 14, weight: 600 });
    b += rect(x0 + 6 * (bw + gap), base + 40, 6 * (bw + gap) - gap, 30, G3) + text(x0 + 9 * (bw + gap), base + 60, "Complex · firm deadline stated with price", { anchor: "middle", size: 14, weight: 600 });
    return svg(base + 90, b, "Job categories by design time");
  },

  "price-ladder": () => {
    let b = head("Price ladder", "Public price: from $35 a design · the team quotes every order");
    const steps = [["Render-only", "from $15", 15], ["Standard (A–C) · first design", "$35", 35], ["Complex (D–F)", "$85", 85], ["Sculpted (G–L)", "from $120, quoted", 120]];
    const base = 380, x0 = 60, sw = 210;
    steps.forEach(([l, d, v], i) => {
      const h = (v / 130) * 250, x = x0 + i * (sw + 12);
      b += rect(x, base - h, sw, h, i === 1 ? INK : G2, `${l}: ${d} a design`);
      b += text(x + sw / 2, base - h - 10, d, { anchor: "middle", weight: 700, size: 17 });
      b += text(x + sw / 2, base + 24, l, { anchor: "middle", size: 14 });
    });
    b += text(40, 450, "Plans for regular clients", { weight: 700, size: 17 });
    const plans = [["Volume credits", "20 for $990 · 50 for $2,250", "valid 6 months; 50-pack priority queue"], ["Monthly partner", "$1,500 / month", "35 standard CADs · $45 overage · named AM"], ["Dedicated designer", "$2,900–3,500 / month", "test · ~140 h/month in US hours"]];
    plans.forEach(([n, p, d], i) => {
      const x = 40 + i * 310;
      b += rect(x, 470, 295, 92, "#FFFFFF", `${n}: ${p} — ${d}`, ` stroke="${INK}" stroke-width="1.5"`);
      b += text(x + 16, 498, n, { weight: 700 }) + text(x + 16, 523, p, { size: 15 }) + text(x + 16, 547, d, { size: 12, fill: G2 });
    });
    return svg(590, b, "Price ladder");
  },

  "competitor-prices": () => {
    let b = head("Published B2B CAD prices (69-company study, Oct 2026)", "US$ per design · ranges and points; median entry ≈ $33");
    const x0 = 290, x1 = W - 60, max = 160, sx = (v) => x0 + (v / max) * (x1 - x0);
    const rows = [
      ["Low-cost (Artinal, JRI, JewelryCAD.pro)", 12, 20, G3],
      ["Fiverr / Etsy sellers", 10, 50, G3],
      ["Offshore band", 12, 49, G2],
      ["Jewelry CAD on Demand", 35, 49, G2],
      ["Caddesignerla", 40, 40, G2],
      ["Western trade", 58, 160, G1],
      ["Stuller (submit / modify)", 99, 149, G1],
      ["TCP (Standard / Complex)", 35, 85, INK],
    ];
    const top = 110, rh = 40;
    for (let v = 0; v <= max; v += 20) {
      b += `<line x1="${sx(v)}" y1="${top - 6}" x2="${sx(v)}" y2="${top + rows.length * rh}" stroke="${G4}"/>` + text(sx(v), top + rows.length * rh + 22, `$${v}`, { anchor: "middle", size: 13, fill: G2 });
    }
    b += `<line x1="${sx(33)}" y1="${top - 10}" x2="${sx(33)}" y2="${top + rows.length * rh}" stroke="${INK}" stroke-dasharray="5 4" stroke-width="1.5"/>` + text(sx(33) + 6, top - 14, "median ≈ $33", { size: 13, weight: 600 });
    rows.forEach(([l, a, z, f], i) => {
      const y = top + i * rh + rh / 2;
      b += text(x0 - 12, y + 5, l, { anchor: "end", size: 14, weight: f === INK ? 700 : 400 });
      const label = a === z ? `$${a}` : z >= 160 && l === "Western trade" ? `$${a}+` : `$${a}–$${z}`;
      if (a === z) b += `<circle class="mark" cx="${sx(a)}" cy="${y}" r="9" fill="${f}"${tip(`${l}: ${label}`)}></circle>`;
      else b += rect(sx(a), y - 9, sx(z) - sx(a), 18, f, `${l}: ${label}`);
    });
    b += text(40, top + rows.length * rh + 54, "No competitor guarantees turnaround with a refund; almost none guarantee castability. Sell on proof, not price.", { size: 14, fill: G1 });
    return svg(top + rows.length * rh + 74, b, "Published B2B CAD prices");
  },

  "sequence-timeline": () => {
    let b = head("Outreach sequence", "Three messages, never more unless they reply · stop-on-reply ON");
    const x0 = 80, x1 = W - 80, sx = (d) => x0 + ((d - 1) / 13) * (x1 - x0), y = 200;
    b += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${INK}" stroke-width="3"/>`;
    for (let d = 1; d <= 14; d++) b += `<line x1="${sx(d)}" y1="${y - 6}" x2="${sx(d)}" y2="${y + 6}" stroke="${G2}"/>` + text(sx(d), y + 28, `D${d}`, { anchor: "middle", size: 12, fill: G2 });
    const ev = [[1, "Email 1", "True line + one ask"], [4, "Follow-up", "Photo or sketch offer"], [10, "Close", "\"Reply 'CAD' anytime\""]];
    ev.forEach(([d, t, s]) => {
      b += `<circle class="mark" cx="${sx(d)}" cy="${y}" r="16" fill="${INK}"${tip(`Day ${d} — ${t}: ${s}`)}></circle>`;
      const a = d === 1 ? "start" : "middle", tx = d === 1 ? sx(d) - 16 : sx(d);
      b += text(tx, y - 60, t, { anchor: a, weight: 700, size: 17 }) + text(tx, y - 36, s, { anchor: a, size: 13, fill: G1 });
    });
    b += text(40, 290, "US phone calls and LinkedIn for Tier 1 anchors only with the Client Acquisition Lead's approval [TBC]. WhatsApp is never first contact.", { size: 14, fill: G1 });
    return svg(320, b, "Outreach sequence");
  },

  "sending-ramp": () => {
    let b = head("Sending ramp per inbox", "New prospects per inbox per day · hard cap 30 total sends per inbox per day");
    const segs = [["Days 8–14", 5], ["Days 15–21", 8], ["Days 22–30", 10], ["Steady", 8]];
    const base = 360, top = 120, x0 = 120, sw = 190, max = 12;
    for (let v = 0; v <= max; v += 2) b += `<line x1="${x0}" y1="${base - (v / max) * (base - top)}" x2="${x0 + 4 * sw}" y2="${base - (v / max) * (base - top)}" stroke="${G4}"/>` + text(x0 - 10, base - (v / max) * (base - top) + 5, String(v), { anchor: "end", size: 13, fill: G2 });
    segs.forEach(([l, v], i) => {
      const h = (v / max) * (base - top), x = x0 + i * sw;
      b += rect(x + 10, base - h, sw - 20, h, i === 3 ? G2 : INK, `${l}: ${v} new prospects per inbox per day`);
      b += text(x + sw / 2, base - h - 10, `${v}${i === 3 ? " (about)" : ""}`, { anchor: "middle", weight: 700 });
      b += text(x + sw / 2, base + 24, l, { anchor: "middle", size: 14 });
    });
    b += text(40, 420, "Days 1–7 are not set in the plan [TBC]. Pause any inbox above 2% bounces; keep Gmail spam under 0.1%.", { size: 14, fill: G1 });
    return svg(440, b, "Sending ramp per inbox");
  },

  "funnel-targets": () => {
    let b = head("Outbound funnel, base case (A)", "Per month for the team from January 2027 · per rep ≈ one third");
    const rows = [["Prospects contacted", 1500, "1,500"], ["Positive replies (2% of contacted)", 30, "30"], ["Qualified (60% of positive)", 18, "18"], ["Paying (35% of qualified)", 6.3, "≈ 6 new customers"]];
    const x0 = 330, plotW = 470;
    rows.forEach(([l, v, d], i) => {
      const w = Math.max(Math.sqrt(v / 1500) * plotW, 14), y = 100 + i * 70;
      b += text(x0 - 14, y + 34, l, { anchor: "end", size: 15 });
      b += rect(x0, y + 10, w, 40, [INK, G1, G2, G3][i], `${l}: ${d} a month`);
      b += text(x0 + w + 12, y + 36, d, { weight: 700, size: 16 });
    });
    b += text(40, 410, "Bar lengths use a square-root scale so the small steps stay visible. All rates are plan assumptions (A).", { size: 13, fill: G2 });
    return svg(430, b, "Outbound funnel, base case");
  },

  "account-mix": () => {
    const rows = [
      ["Custom retailers · 57 × 5 @ $85", 24225], ["Channel partners · 6 × 60 @ $42", 15120], ["DTC brands · 16 × 15 @ $60", 14400],
      ["Render programmes (balance)", 12675], ["Small manufacturers · 12 × 15 @ $50", 9000], ["Mid manufacturers · 3 × 40 @ $38", 4560], ["Wholesalers · 8 × 8 @ $55", 3520],
    ];
    return hbars({
      title: "The $1M account mix (E, Model Validation)",
      sub: "Monthly revenue by account type · ~102 accounts, ~1,249 jobs a month ≈ $83.5k a month",
      rows: rows.map(([label, value], i) => ({ label, value, display: `$${value.toLocaleString("en-US")}/mo`, fill: label.startsWith("Render") ? G3 : i === 0 ? INK : G1, tip: `${label}: $${value.toLocaleString("en-US")} a month (E)` })),
      labelW: 330,
      foot: "Render programmes = $83.5k minus the six account types (derived). Model prices predate the $35 Standard decision.",
    });
  },
};

export const CHART_TITLES = Object.fromEntries(Object.keys(CHARTS).map((k) => [k, CHARTS[k]().match(/aria-label="([^"]*)"/)[1]]));
