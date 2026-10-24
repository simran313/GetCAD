# Phase 7a rollout — QC certificate, file fingerprints, weight sheet

What ships: every CAD delivery now carries a signed QC certificate and a weight sheet, and every file gets a fingerprint.

## 1. Apply the database change
In the Codespace:

```
npm run db:apply
```

It applies `0050_certificates.sql` and the policy `0039_certificates_rls.sql`.

**Effect on work in progress:**
- A CAD job can no longer be **submitted to QC** until the designer enters the model volume.
- A CAD job can no longer **pass QC** until the pod lead records the measurements, with 0 open edges.
- Render-only orders are not affected.

## 2. Merge
Merge once the checks are green. No new settings.

## 3. What changes
- **Designer, job page:** a new **Model volume** box (mm³). The value comes from Rhino → Analyze → Mass properties → Volume on the final model. It is required before **Submit to QC**.
- **Pod lead, QC review:**
  - a **Measured specification** form: minimum wall, minimum prong, inner diameter, mesh tolerance, ring size, open edges (must be 0), and stone seats. **Pass to client** stays off until it is saved.
  - **Client waivers:** when a client asks for less than a minimum (e.g. a 0.6 mm prong), record it here. It is printed on the certificate, and a claim on that measurement is not covered.
- **On Pass:** the **QC certificate** PDF is made and stored. It can never be changed. It shows:
  - the measured specification;
  - the 19 checks, with the time each was ticked by the designer and by QC;
  - any waivers;
  - the designer by number and the pod lead by pod;
  - each file's fingerprint.
  - It carries no studio name (white-label).
- **Client:**
  - the order page has **Documents**: **QC certificate** and **Weight sheet** (grams in 10K, 14K, 18K, platinum and silver, plus the stones and key sizes);
  - **Files** shows each file's SHA-256 fingerprint.
- **Admin:** the order page links to both PDFs, and has **Issue certificate** if one ever failed to generate.

## 4. Check it
1. Take a test CAD job through: designer enters the volume, uploads files, ticks 19, submits.
2. As pod lead: record measurements and press Pass.
3. As the client:
   - open **Documents → QC certificate**;
   - open **Weight sheet**;
   - open **Files** and see the fingerprints.
4. Try to pass a job with "Open edges" set to 1: it is refused.

Orders that passed QC before this update have no certificate, and files uploaded before it have no fingerprint.
