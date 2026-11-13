// What runs on its own: notifications, push and email.
export default {
  title: "Notifications, push and email",
  width: 1040, height: 390,
  caption: "Queued in the same transaction as the event; sent separately, so an outage delays but never loses",
  nodes: [
    { id: "ev", x: 20, y: 160, w: 160, h: 64, label: "Event", sub: "state change, message,\nfile, payout…" },
    { id: "audit", x: 220, y: 50, w: 170, h: 64, label: "audit.audit_log", sub: "hash-chained", kind: "data" },
    { id: "notif", x: 220, y: 160, w: 170, h: 64, label: "notifications", sub: "per person, identity-free", kind: "data" },
    { id: "outbox", x: 220, y: 270, w: 170, h: 64, label: "email_outbox", sub: "idempotency key", kind: "data" },
    { id: "bell", x: 440, y: 160, w: 170, h: 64, label: "Bell + toasts", sub: "in the open app" },
    { id: "gha", x: 440, y: 50, w: 170, h: 64, label: "GitHub Actions", sub: "every 5 minutes", kind: "external" },
    { id: "cpush", x: 660, y: 50, w: 170, h: 64, label: "/api/cron/push", sub: "Bearer CRON_SECRET" },
    { id: "cmail", x: 660, y: 270, w: 170, h: 64, label: "/api/cron/emails", sub: "Bearer CRON_SECRET" },
    { id: "wp", x: 870, y: 50, w: 150, h: 64, label: "Web Push", sub: "VAPID", kind: "external" },
    { id: "resend", x: 870, y: 270, w: 150, h: 64, label: "Resend", kind: "external" },
    { id: "sla", x: 440, y: 270, w: 170, h: 64, label: "sla_sweep()", sub: "every minute via pg_cron\n(if enabled)", kind: "warn" },
  ],
  edges: [
    { from: "ev", to: "audit" }, { from: "audit", to: "notif", fromSide: "b", toSide: "t", label: "fan-out trigger", labelAt: [345, 137] }, { from: "ev", to: "outbox" },
    { from: "notif", to: "bell" }, { from: "gha", to: "cpush" }, { from: "cpush", to: "wp" },
    { from: "gha", to: "cmail", via: [[640, 82], [640, 302]], toSide: "l", dashed: true },
    { from: "outbox", to: "cmail", via: [[305, 352], [745, 352]], fromSide: "b", toSide: "b" }, { from: "cmail", to: "resend" },
    { from: "sla", to: "outbox", dashed: true, label: "credits", labelAt: [415, 290] },
  ],
};
