# Phase 4b rollout — files in messages, faster updates

What ships: migration `0045`, policy `0035` (2 files); a file picker under each conversation on the order page; downloads through `/api/thread-files/…`; the order page refreshes within about 5 seconds of any change it can show you.

## 1. Apply and merge
```bash
git fetch origin
git checkout claude/gracious-hopper-amum18
git reset --hard origin/claude/gracious-hopper-amum18
DATABASE_URL="postgresql://...your address..." npm run db:status    # 2 pending
DATABASE_URL="postgresql://...your address..." npm run db:apply     # applied 2 file(s)
```
Then merge the pull request straight away. No settings change.

## 2. How files in messages work
| Conversation | Who sees the file | Accepted |
| --- | --- | --- |
| **Client ↔ Team** | client, admins, pod lead | PNG, JPEG, PDF, ZIP, STEP, STL, 3DM (up to 25 MB) |
| **Team ↔ Designer** | designer, admins, pod lead | PNG, JPEG, STEP, STL, 3DM only. Author, studio and other details inside the file are removed before it is stored. |

- Files are renamed by the system (`file_1.pdf`, `file_2.3dm` …); the original name is never shown to anyone.
- A designer cannot open a client-thread file, even with its link.
- To give a designer something the client sent, download it and attach it again in **Team ↔ Designer**. A PDF must be turned into a PNG or JPEG first (a screenshot is fine): PDFs can't be cleaned of names, so the designer thread refuses them.
- For a change order (Phase 3b), the pod lead can now send the original 3DM to whichever designer takes it.

## 3. Faster updates
Order pages check every 5 seconds whether anything changed (a message, a file, a status, a tick) and refresh only then. Anything typed in a box stays.

## 4. Quick test on the live site
1. As the pod lead, on an order with a designer: **Team ↔ Designer** → attach a small PNG → Send. It shows as `file_1.png`.
2. As the designer (another browser): within about 5 seconds the message appears without reloading; the file downloads.
3. As the client: attach a PDF in **Messages** → the pod lead sees it; the designer does not.
4. As the pod lead, try a PDF in **Team ↔ Designer**: it is refused with the list of accepted formats.
