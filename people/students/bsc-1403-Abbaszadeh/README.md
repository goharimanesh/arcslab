# Student folder template

Copy this whole folder and rename the copy to the student's ID, for example:

```
people/students/msc-1405-ahmadi/
```

## What goes in this folder

| File | Purpose |
|------|---------|
| `photo.jpg` | Square profile photo (at least 400×400 px). Replace `photo.svg`. |
| `cv.pdf` | (optional) Short CV |
| `README.md` | Notes: thesis title, supervisor, start date, contact |

## Then add one row to `data/team.csv`

```
msc-1405-ahmadi,Ali Ahmadi,msc,,MSc Student,people/students/msc-1405-ahmadi/photo.jpg,ali@example.com,,Thesis topic here,,https://scholar.google.com/...,,,,https://www.linkedin.com/in/...,https://github.com/...,
```

`category` must be one of: `phd`, `msc`, `bsc`, `alumni`.
When a student graduates, just change `msc` → `alumni` (and optionally move the folder to `people/alumni/`).

---
Student: _name_  · Degree: _MSc / BSc_ · Supervisor: _name_ · Start: _year_
Thesis / project: _title_
