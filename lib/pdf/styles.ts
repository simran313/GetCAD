import { StyleSheet } from "@react-pdf/renderer";

/**
 * The PDFs' look: black on white, small mono labels, like the portal.
 * Built-in Helvetica / Courier, so nothing is fetched while rendering.
 * White-label (DECISIONS §7): no studio name or logo on any page.
 */
export const pdf = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: "#0A0A0A", lineHeight: 1.4 },
  eyebrow: { fontFamily: "Courier", fontSize: 7.5, color: "#52524C", letterSpacing: 1 },
  title: { fontSize: 20, lineHeight: 1.2, marginTop: 4, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9, color: "#52524C", marginBottom: 14 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E3E3DF", paddingVertical: 3 },
  label: { width: 150, color: "#52524C" },
  value: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 7.5 },
  tick: { width: 70, fontFamily: "Courier", fontSize: 7.5 },
  note: { marginTop: 4, padding: 6, backgroundColor: "#F7F7F5", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7, color: "#85857E", fontFamily: "Courier" },
});
