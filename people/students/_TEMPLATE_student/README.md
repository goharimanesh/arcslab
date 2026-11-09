# Student folder template

1. Copy this folder and rename it with the student's id, e.g. `people/students/msc-1405-Ahmadi/`.
2. Put a square photo named `photo.jpg` in it (≥ 400 × 400 px). Until then the site shows `photo.svg`
   (a placeholder with the student's name — create one by copying this folder's photo.svg, or leave it out
   and the general placeholder is used).
3. Add one row to `data/team.csv`. Important columns:

| column | example |
|---|---|
| id | `msc-1405-Ahmadi` (same as the folder name) |
| name | `Ali Ahmadi` |
| category | `msc`, `bsc`, `phd` or `alumni` |
| photo | `people/students/msc-1405-Ahmadi/photo.jpg` |
| bio | 1–3 sentences about the student's work |
| research_topic | one line |
| skills | `SOFA; 3D printing; Python` |
| pub_names | how the name appears in papers, e.g. `Ahmadi A.` — fill only once the student has a paper, and check it does not match another author |
| scholar, orcid, linkedin, github … | full links (optional) |

4. Add the student's project to `data/projects.csv` with `student_id` = the same id — it then appears on the profile.

The profile page is created automatically: `profile.html?id=msc-1405-Ahmadi`.
