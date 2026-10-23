# Phase 3a rollout — assignment, checklist, upload slots

What ships: migration `0041`, policy `0032` (2 files); the assignment picker, the checklist and the upload slots on the order page; STL and 3DM uploads.

## 1. Apply and merge
```bash
git fetch origin
git checkout claude/gracious-hopper-amum18
git reset --hard origin/claude/gracious-hopper-amum18
DATABASE_URL="postgresql://...your address..." npm run db:status    # 2 pending
DATABASE_URL="postgresql://...your address..." npm run db:apply     # applied 2 file(s)
```
Then merge the pull request.

## 2. Before the first job: put designers in the pod
A designer must have signed up in the app and accepted the agreement (`/onboarding/designer`). Then add them to Pod 1 (SQL Editor, their ID in line 3):
```sql
DO $$
DECLARE
  designer_id text := 'PASTE_DESIGNER_ID';
  admin_id text; pod text;
BEGIN
  SELECT user_id INTO STRICT admin_id FROM public.staff_profiles WHERE first_name = 'Fazil';
  SELECT id INTO STRICT pod FROM public.pods WHERE name = 'Pod 1';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  PERFORM public.set_pod_member(pod, designer_id, 'DESIGNER');
END $$;
```

## 3. How a job now flows
| Step | Who | On the order page |
| --- | --- | --- |
| 1 | Admin | Quote, mark paid (if not card), confirm — as in Phase 2 |
| 2 | Pod lead (or admin) | **Assign a designer**: pick from the pod; load shows minutes used of 480. Over 480 warns (blocking is off). |
| 3 | Designer | Move to In progress. **Checklist**: tick the 18 checks + sign-off (left boxes). **Upload slots**: 3DM, STL, TV, PV, RV, FV, BV, M (images), DD, GW (images). |
| 4 | Designer | Submit (Designer submitted). Refused until all 19 ticks and all 10 files are in; then it goes straight to QC. |
| 5 | Pod lead | **Checklist** right-hand boxes: all 19 (row 19 is your sign-off). **Pass** sends it to the client; **Send back** needs a note, which the designer sees in their messages, and opens version 2. |
| 6 | Client | Sees the 5 renders, diamond details and gold weight; 3DM, STL and M unlock after approval. |

Files are named by the system, e.g. `RN-C-12_STL_v1.stl`. 3DM and STL files are cleaned of author and studio details on upload.

## 4. Things to tell designers
- 3DM: **explode blocks** before uploading; a file with blocks is refused with that message.
- Render slots take PNG or JPEG; PDFs are not accepted.
- Maximum file size is 25 MB.

## 5. Quick test on the live site
1. Use a paid, confirmed test order in Pod 1.
2. As the pod lead, assign the test designer.
3. As the designer: In progress → tick all 19 → upload a small file into every required slot → Designer submitted. The order shows **QC review**.
4. As the pod lead: Send back with a note → the designer sees "Sent back by QC: …" in messages, and the checklist is empty again (version 2).
