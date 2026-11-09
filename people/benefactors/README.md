# Benefactors

One folder per person (or organisation) listed in `data/benefactors.csv`.
Put a square photo named `photo.jpg` in the person's folder — it replaces the placeholder `photo.svg` automatically
(no CSV change needed).

To add someone:
1. Create `people/benefactors/<id>/` (lowercase, hyphens), add `photo.jpg` if available.
2. Add a row to `data/benefactors.csv`:
   `id,name,in_memoriam,contribution,photo`
   `in_memoriam` = `yes` shows "In loving memory" and "The late …".
