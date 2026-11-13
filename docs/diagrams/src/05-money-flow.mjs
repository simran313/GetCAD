// Where the money is: escrow ledger, release legs and payouts.
export default {
  title: "Money flow and escrow",
  width: 1040, height: 390,
  caption: "Ledger rows are append-only; a trigger refuses any release or refund that exceeds what was collected",
  nodes: [
    { id: "quote", x: 20, y: 60, w: 160, h: 64, label: "Quote", sub: "total = designer + QC\n+ platform (exact)" },
    { id: "rzp", x: 215, y: 60, w: 170, h: 64, label: "Razorpay checkout", sub: "card · UPI · international", kind: "external" },
    { id: "wh", x: 420, y: 60, w: 170, h: 64, label: "Signed webhook", sub: "/api/webhooks/razorpay\nHMAC · idempotent" },
    { id: "manual", x: 215, y: 170, w: 170, h: 64, label: "Manual payment", sub: "admin records Wise /\nPayPal / bank" },
    { id: "ledger", x: 625, y: 100, w: 190, h: 90, label: "escrow_ledger", sub: "HOLD (+) · RELEASE (−)\nREFUND (−) · REVERSAL (+)\nappend-only · conserved", kind: "data" },
    { id: "close", x: 625, y: 265, w: 190, h: 56, label: "Order CLOSED", sub: "finance releases" },
    { id: "legs", x: 870, y: 100, w: 150, h: 90, label: "Payout obligations", sub: "designer (INR)\npod / QC\nplatform commission", kind: "data" },
    { id: "route", x: 870, y: 265, w: 150, h: 56, label: "Razorpay Route", sub: "bank transfer", kind: "external" },
    { id: "refund", x: 420, y: 265, w: 170, h: 56, label: "Refund", sub: "finance · full or partial" },
  ],
  edges: [
    { from: "quote", to: "rzp" }, { from: "rzp", to: "wh" }, { from: "wh", to: "ledger", label: "HOLD" },
    { from: "manual", to: "ledger", via: [[600, 202]], toSide: "l", label: "HOLD (admin)", labelAt: [500, 202] },
    { from: "close", to: "ledger", fromSide: "t", toSide: "b" },
    { from: "ledger", to: "legs", label: "RELEASE", labelAt: [842, 132] }, { from: "legs", to: "route", fromSide: "b", toSide: "t" },
    { from: "route", to: "ledger", dashed: true, label: "bounced → REVERSAL", via: [[945, 350], [780, 350], [780, 190]], toSide: "b", labelAt: [870, 350] },
    { from: "ledger", to: "refund", dashed: true, fromSide: "b", via: [[660, 230], [505, 230]], toSide: "t", label: "REFUND", labelAt: [580, 230] },
  ],
};
