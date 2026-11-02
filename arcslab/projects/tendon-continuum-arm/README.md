# Project folder template

Copy this folder and rename it with a short project ID (lowercase, hyphens), e.g.:

```
projects/magnetic-soft-actuator/
```

## Suggested contents

```
projects/<project-id>/
├── cover.jpg        ← 16:9 picture shown on the website (replace cover.svg)
├── README.md        ← goals, team, timeline, links
├── docs/            ← proposal, reports, presentation slides
├── media/           ← photos and videos of experiments
└── data/            ← small datasets (keep large files elsewhere)
```

## Then add one row to `data/projects.csv`

```
magnetic-soft-actuator,Magnetic Soft Actuator,ongoing,"One or two sentences describing the project.",Student Name – MSc,Dr. Masoud Gohari-Manesh,Soft actuator; Magnetics,projects/magnetic-soft-actuator/cover.jpg,2027,
```

`status` must be one of: `ongoing`, `planned`, `completed`.
`keywords` are separated by semicolons `;`.

---
Lead researcher: _name_ · Supervisor(s): _names_ · Started: _year_
