# ARCSLAB Website

**Advanced Robotics and Control Systems Laboratory**
Department of Mechanical Engineering, University of Torbat Heydarieh, Iran

A minimal, responsive, single-page lab website built with plain HTML, CSS and JavaScript — no frameworks, no build step. All changing content (people, projects, facilities, events) lives in simple **CSV files** that you can edit in Excel, Google Sheets or any text editor.

---

## 1. Folder structure

```
arcslab/
├── index.html                ← the page structure (sections, headings, contact info)
├── .nojekyll                 ← tells GitHub Pages to serve files as they are
├── README.md                 ← this guide
│
├── css/
│   └── style.css             ← colors, fonts, layout (colors are at the very top)
├── js/
│   └── main.js               ← reads the CSV files and builds the cards
│
├── data/                     ← ★ YOU EDIT THESE ★
│   ├── team.csv              ← faculty, students, alumni
│   ├── projects.csv          ← research projects
│   ├── facilities.csv        ← equipment & resources
│   └── events.csv            ← news, conferences, trips, seminars
│
├── assets/
│   ├── images/
│   │   ├── hero/             ← big background drawing on the home section
│   │   ├── logo/             ← lab logo + browser-tab icon (favicon)
│   │   ├── icons/            ← small icons (vision, mission, contact)
│   │   ├── people/           ← default "no photo" picture
│   │   ├── projects/         ← default project picture
│   │   ├── facilities/       ← pictures of equipment
│   │   └── events/           ← photos from events (optional)
│   └── documents/            ← PDFs (brochures, posters, call for students)
│
├── people/
│   ├── faculty/
│   │   ├── masoud-gohari-manesh/   ← photo.jpg, cv.pdf
│   │   └── ali-koochi/
│   ├── students/
│   │   ├── _TEMPLATE_student/      ← copy this for every new student
│   │   ├── student-msc-01/
│   │   └── ...
│   └── alumni/                     ← move graduated students here
│
└── projects/
    ├── _TEMPLATE_project/          ← copy this for every new project
    │   ├── cover.svg  README.md  docs/  media/  data/
    ├── tendon-continuum-arm/
    ├── soft-gripper/
    ├── soft-actuator-sim/
    └── aerial-continuum/
```

---

## 2. Publishing on GitHub Pages (one-time setup)

1. Sign in to <https://github.com> (account: `goharimanesh` or a lab account).
2. Click **New repository**.
   - Name it **`ARCSLAB`** → the site will be at `https://goharimanesh.github.io/ARCSLAB/`
   - *Or* name it **`<username>.github.io`** → the site will be at `https://<username>.github.io/`
   - Set it to **Public**, then **Create repository**.
3. Click **Add file → Upload files**, then drag **the contents** of the `arcslab` folder
   (`index.html`, `css`, `js`, `data`, `assets`, `people`, `projects`, `README.md`, `.nojekyll`) into the page.
   Click **Commit changes**.
   > Tip: `.nojekyll` is a hidden file. If your computer hides it, use GitHub Desktop, or create it on GitHub with **Add file → Create new file**, name `.nojekyll`, leave it empty.
4. Go to **Settings → Pages**.
   Under **Build and deployment → Source** choose **Deploy from a branch**, Branch: **main**, Folder: **/ (root)** → **Save**.
5. Wait 1–2 minutes and open the address shown at the top of the Pages settings.

**Using Git on the command line instead:**

```bash
cd arcslab
git init
git add .
git commit -m "First version of ARCSLAB website"
git branch -M main
git remote add origin https://github.com/goharimanesh/ARCSLAB.git
git push -u origin main
```

---

## 3. Updating content (no programming needed)

Edit a CSV file → save → upload/commit to GitHub → the website updates within a minute or two.
On GitHub you can edit directly: open the file → click the ✏️ pencil icon → edit → **Commit changes**.

### Golden rules for CSV files

- The **first line** (column names) must never be changed.
- If a value contains a **comma**, wrap it in double quotes: `"Associate Professor, Mechanical Eng."`
- **Lists** inside one cell (keywords, interests) are separated by **semicolons**: `Soft actuator; Pneumatics`
- Leave a cell **empty** if you have no value — the website hides it automatically.
- A line starting with `#` is ignored (handy to hide a row temporarily).
- If you use Excel, save as **CSV UTF-8 (Comma delimited)**.

### `data/team.csv`

| Column | Meaning | Example |
|---|---|---|
| `id` | short unique ID (same as folder name) | `msc-1405-ahmadi` |
| `name` | full name | `Ali Ahmadi` |
| `category` | `faculty`, `phd`, `msc`, `bsc` or `alumni` | `msc` |
| `role` | shown above faculty names | `Founder & Director` |
| `title` | position | `MSc Student` |
| `photo` | path to photo | `people/students/msc-1405-ahmadi/photo.jpg` |
| `email` | e-mail address | |
| `bio` | short biography (faculty) | |
| `research_topic` | thesis/project topic (students) | |
| `interests` | research interests, `;`-separated | |
| `scholar`, `scopus`, `orcid`, `researchgate`, `linkedin`, `github`, `website` | **full links** to profiles | `https://orcid.org/0000-...` |

Faculty appear as large cards; everyone else appears as small cards with filter buttons (PhD / MSc / BSc / Alumni).

**Adding a new student:**
1. Copy `people/students/_TEMPLATE_student/` → rename it, e.g. `people/students/msc-1405-ahmadi/`.
2. Put the student's `photo.jpg` in it.
3. Add one row to `data/team.csv`.

**When a student graduates:** change `msc` → `alumni` in `team.csv`.

### `data/projects.csv`

| Column | Meaning |
|---|---|
| `id` | short ID (same as the project folder name) |
| `title` | project title |
| `status` | `ongoing`, `planned` or `completed` |
| `summary` | 1–3 sentences (use quotes) |
| `student` | lead student researcher |
| `supervisor` | supervisor(s) |
| `keywords` | `;`-separated |
| `image` | e.g. `projects/<id>/cover.jpg` (16:9 picture) |
| `start` | start year |
| `link` | optional link (paper, video, GitHub repo) |

**Adding a new project:** copy `projects/_TEMPLATE_project/`, rename it, replace `cover.svg` with a real `cover.jpg`, add a row to `projects.csv`.

### `data/facilities.csv`

`name, category, description, image` — pictures go in `assets/images/facilities/` (4:3 ratio looks best).

### `data/events.csv`

| Column | Meaning |
|---|---|
| `date` | start date, format **YYYY-MM-DD** (e.g. `2027-02-20`) |
| `end_date` | optional end date (multi-day events) |
| `title` | event name |
| `type` | `Conference`, `Seminar`, `Visit`, `Workshop`, `Lab News`… |
| `location` | city / venue |
| `description` | one sentence |
| `link` | optional website |

Events are **sorted automatically** into *Upcoming* and *Past* using today's date — you never need to move rows.

---

## 4. ⚠️ Before going live — please check

- [ ] **Faculty profile links** in `data/team.csv`:
  - Dr. Ali Koochi — Google Scholar, Scopus (ID 36613214200) and ORCID (0000-0003-2260-2638) are direct profile links.
  - Dr. Masoud Gohari-Manesh — ResearchGate and GitHub are direct links; **Google Scholar, Scopus, ORCID and LinkedIn currently point to search pages**. Replace them with the direct profile URLs.
  - LinkedIn and ResearchGate for Dr. Koochi are also search links — replace if profiles exist.
- [ ] **Lab e-mail** in `index.html` (Contact section) — currently `arcslab@torbath.ac.ir` as a placeholder.
- [ ] **Faculty photos**: add `photo.jpg` in each faculty folder.
- [ ] Replace sample students, projects and events (marked "sample").

### How to find each direct profile link
| Platform | Where to copy the link |
|---|---|
| Google Scholar | Open your profile → copy the address bar (contains `user=XXXXXXXX`) |
| Scopus | Search yourself in Scopus Author Search → open profile → link looks like `https://www.scopus.com/authid/detail.uri?authorId=...` |
| ORCID | `https://orcid.org/0000-0000-0000-0000` |
| LinkedIn | Your profile → *Contact info* → `https://www.linkedin.com/in/...` |
| ResearchGate | `https://www.researchgate.net/profile/First-Last` |

---

## 5. Customising the look

- **Colors:** top of `css/style.css` (`--accent` = deep blue, `--olive` = olive green).
- **Texts** (Mission, Vision, Contact address): edit directly in `index.html` — each section is marked with a big comment.
- **Logo:** replace `assets/images/logo/arcslab-logo.svg` (keep the same file name).
- **Adding a new profile platform** (e.g. Web of Science): add a column in `team.csv` and one line in `PROFILE_LINKS` at the top of `js/main.js`.

---

## 6. Previewing on your own computer

Browsers block reading CSV files when `index.html` is opened directly by double-click. Use a tiny local server:

```bash
cd arcslab
python -m http.server 8000
```

Then open <http://localhost:8000>. (VS Code users: the *Live Server* extension also works.)
