#!/usr/bin/env python3
"""
ARCSLAB publication manager  —  standard library only (Python 3.8+)
=====================================================================

Keeps data/publications.csv up to date. Commands:

  python scripts/publications.py import FILE [FILE ...]   Import Scopus CSV or BibTeX (.bib) exports
  python scripts/publications.py sync                     New papers + citation counts from OpenAlex
  python scripts/publications.py classify                 Re-assign the main category of every paper
  python scripts/publications.py dedupe                   Merge duplicates (same DOI / near-identical title)
  python scripts/publications.py probe                    Show which online sources respond right now
  python scripts/publications.py stats                    Short summary of the data file

Files (all in data/):
  publications.csv            the data the website reads (generated — avoid hand edits except small fixes)
  publication_categories.csv  category rules: keywords with weights, e.g.  continuum robot*6; tendon*2
  publication_overrides.csv   manual fixes per DOI or paper id: category, type, image, hide
  publications_config.json    authors (ORCID / Scopus id), similarity threshold, options
  publications_meta.json      date of the last update (written automatically)

Environment variables (optional):
  OPENALEX_MAILTO   an e-mail address for OpenAlex's "polite pool" (faster, recommended in GitHub Actions)
  OPENALEX_URL      override the API base URL (used for testing)
"""
import csv
import difflib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PUB_FILE = os.path.join(DATA, "publications.csv")
CAT_FILE = os.path.join(DATA, "publication_categories.csv")
OVR_FILE = os.path.join(DATA, "publication_overrides.csv")
CFG_FILE = os.path.join(DATA, "publications_config.json")
META_FILE = os.path.join(DATA, "publications_meta.json")

FIELDS = ["id", "title", "authors", "year", "type", "venue", "volume", "issue", "pages",
          "doi", "link", "citations", "cited_scopus", "cited_openalex", "abstract", "keywords",
          "category", "category_source", "lab_authors", "image", "versions", "source", "openalex_id"]

TYPE_RANK = {"journal": 0, "book": 1, "chapter": 2, "conference": 3, "thesis": 4, "other": 5}
UA = "ARCSLAB-publications/1.0 (+https://github.com/goharimanesh/arcslab)"


# --------------------------------------------------------------------------- helpers
def log(*a):
    print(*a, flush=True)


def load_config():
    with open(CFG_FILE, encoding="utf-8") as f:
        return json.load(f)


def read_csv(path):
    """Read a CSV into a list of dicts, skipping blank lines and lines starting with #."""
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        lines = [ln for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
    return list(csv.DictReader(lines))


def write_publications(rows):
    rows = sorted(rows, key=lambda r: (-int(r.get("year") or 0), r.get("title", "").lower()))
    tmp = PUB_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: (r.get(k) if r.get(k) is not None else "") for k in FIELDS})
    old = open(PUB_FILE, encoding="utf-8").read() if os.path.exists(PUB_FILE) else None
    new = open(tmp, encoding="utf-8").read()
    if old == new:
        os.remove(tmp)
        log("publications.csv unchanged.")
        return False
    os.replace(tmp, PUB_FILE)
    log(f"publications.csv written ({len(rows)} papers).")
    return True


def write_meta(**kw):
    meta = {}
    if os.path.exists(META_FILE):
        try:
            meta = json.load(open(META_FILE, encoding="utf-8"))
        except ValueError:
            meta = {}
    meta.update(kw)
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def norm_doi(d):
    d = (d or "").strip().lower()
    d = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", d)
    return d.strip().rstrip(".")


def norm_title(t):
    t = unicodedata.normalize("NFKD", html.unescape(t or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def title_sim(a, b):
    a, b = norm_title(a), norm_title(b)
    if not a or not b or min(len(a), len(b)) < 20:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def clean_abstract(a):
    a = html.unescape(a or "").strip()
    if a.lower().startswith("[no abstract"):
        return ""
    a = re.sub(r"\s*(©|Copyright ©|\(c\)).*$", "", a, flags=re.S | re.I)   # strip publisher copyright line
    a = re.sub(r"<[^>]+>", "", a)                                        # strip jats/html tags
    return re.sub(r"\s+", " ", a).strip()


def make_id(authors, year, title, taken):
    first = (authors or "anon").split(";")[0].strip().split(",")[0].split(" ")[0]
    first = re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", first).encode("ascii", "ignore").decode().lower()) or "anon"
    stop = {"a", "an", "the", "on", "of", "in", "for", "and", "using", "to", "with", "by", "based"}
    word = next((w for w in norm_title(title).split() if w not in stop), "paper")
    base = f"{first}{year or ''}{word}"
    pid, n = base, 2
    while pid in taken:
        pid, n = f"{base}{n}", n + 1
    taken.add(pid)
    return pid


def map_type(t):
    t = (t or "").lower()
    if "conference" in t or "proceedings" in t:
        return "conference"
    if "chapter" in t:
        return "chapter"
    if "book" in t:
        return "book"
    if "thesis" in t or "dissertation" in t:
        return "thesis"
    if t in ("article", "review", "journal", "journal-article", "letter", "note", "short survey", "data paper"):
        return "journal"
    return "other"


def to_int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return 0


def finalize_citations(r):
    """citations = the highest count reported by any source (Scopus, OpenAlex)."""
    vals = [to_int(r.get(k)) for k in ("cited_scopus", "cited_openalex") if str(r.get(k) or "").strip()]
    r["citations"] = str(max(vals)) if vals else str(to_int(r.get("citations")))


def lab_authors_for(r, cfg):
    """Which configured authors (by Scopus id / name) appear in this paper."""
    found = set(filter(None, (r.get("lab_authors") or "").split(";")))
    text = norm_title(r.get("authors", "")).replace(" ", "")
    for a in cfg["authors"]:
        surname = norm_title(a["name"].split()[-1]).replace(" ", "")
        if surname and surname in text:
            found.add(a["id"])
    return ";".join(sorted(found))


# --------------------------------------------------------------------------- merging / dedupe
def find_match(rec, rows, threshold):
    doi = norm_doi(rec.get("doi"))
    if doi:
        for r in rows:
            if norm_doi(r.get("doi")) == doi:
                return r
            if doi in [norm_doi(v) for v in (r.get("versions") or "").split(";")]:
                return r
    best, score = None, 0.0
    for r in rows:
        s = title_sim(rec.get("title"), r.get("title"))
        # two journal papers with different DOIs are only merged when the titles are almost identical
        d1, d2 = norm_doi(rec.get("doi")), norm_doi(r.get("doi"))
        if d1 and d2 and d1 != d2 and rec.get("type") == r.get("type"):
            s = s if s >= 0.97 else 0.0
        if s > score:
            best, score = r, s
    return best if score >= threshold else None


def merge_into(keep, other):
    """Merge `other` into `keep` (journal version preferred). Returns the surviving record."""
    if TYPE_RANK.get(other.get("type"), 9) < TYPE_RANK.get(keep.get("type"), 9):
        keep, other = dict(other), keep
        # carry over manual/derived fields from the old record
        for k in ("id", "image", "category", "category_source"):
            if other.get(k) and not keep.get(k):
                keep[k] = other[k]
        keep["id"] = other.get("id") or keep.get("id")
    for k in FIELDS:
        if not keep.get(k) and other.get(k):
            keep[k] = other[k]
    for k in ("cited_scopus", "cited_openalex"):
        keep[k] = str(max(to_int(keep.get(k)), to_int(other.get(k)))) if (keep.get(k) or other.get(k)) else ""
    versions = set(filter(None, (keep.get("versions") or "").split(";"))) | set(filter(None, (other.get("versions") or "").split(";")))
    od = norm_doi(other.get("doi"))
    if od and od != norm_doi(keep.get("doi")):
        versions.add(od)
    keep["versions"] = ";".join(sorted(versions))
    srcs = set(filter(None, (keep.get("source") or "").split(";"))) | set(filter(None, (other.get("source") or "").split(";")))
    keep["source"] = ";".join(sorted(srcs))
    labs = set(filter(None, (keep.get("lab_authors") or "").split(";"))) | set(filter(None, (other.get("lab_authors") or "").split(";")))
    keep["lab_authors"] = ";".join(sorted(labs))
    finalize_citations(keep)
    return keep


def add_records(rows, new, cfg):
    """Add/merge new records into rows. Returns (added, updated)."""
    th = cfg.get("title_similarity", 0.88)
    taken = {r["id"] for r in rows if r.get("id")}
    added = updated = 0
    for rec in new:
        if to_int(rec.get("year")) and to_int(rec.get("year")) < cfg.get("min_year", 0):
            continue
        m = find_match(rec, rows, th)
        if m:
            merged = merge_into(m, rec)
            idx = rows.index(m)
            rows[idx] = merged
            updated += 1
        else:
            rec["id"] = rec.get("id") or make_id(rec.get("authors"), rec.get("year"), rec.get("title"), taken)
            rec["lab_authors"] = lab_authors_for(rec, cfg)
            finalize_citations(rec)
            rows.append(rec)
            added += 1
    return added, updated


def dedupe(rows, cfg):
    th = cfg.get("title_similarity", 0.88)
    out, merged = [], 0
    for r in rows:
        m = find_match(r, out, th)
        if m:
            out[out.index(m)] = merge_into(m, r)
            merged += 1
        else:
            out.append(r)
    return out, merged


# --------------------------------------------------------------------------- importers
def import_scopus_csv(path, cfg):
    recs = []
    scopus_ids = {a["scopus_id"]: a["id"] for a in cfg["authors"] if a.get("scopus_id")}
    for x in read_csv(path):
        if not x.get("Title"):
            continue
        pages = "–".join(p for p in (x.get("Page start"), x.get("Page end")) if p) or x.get("Art. No.", "")
        kws = x.get("Author Keywords") or "; ".join((x.get("Index Keywords") or "").split("; ")[:8])
        labs = {aid for sid, aid in scopus_ids.items() if sid in (x.get("Author(s) ID") or "")}
        doi = norm_doi(x.get("DOI"))
        recs.append({
            "title": x["Title"].strip(), "authors": (x.get("Authors") or "").strip(), "year": x.get("Year", "").strip(),
            "type": map_type(x.get("Document Type")), "venue": (x.get("Source title") or x.get("Conference name") or "").strip(),
            "volume": x.get("Volume", ""), "issue": x.get("Issue", ""), "pages": pages, "doi": doi,
            "link": f"https://doi.org/{doi}" if doi else x.get("Link", ""),
            "cited_scopus": str(to_int(x.get("Cited by"))), "abstract": clean_abstract(x.get("Abstract")),
            "keywords": kws.strip(), "lab_authors": ";".join(sorted(labs)), "source": "scopus",
        })
    return recs


def parse_bibtex(text):
    entries, i = [], 0
    while True:
        m = re.compile(r"@(\w+)\s*\{\s*([^,]*),", re.S).search(text, i)
        if not m:
            break
        etype, key, j, depth = m.group(1).lower(), m.group(2).strip(), m.end(), 1
        k = j
        while k < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[k], 0)
            k += 1
        body, fields, p = text[j:k - 1], {}, 0
        for fm in re.finditer(r"(\w[\w-]*)\s*=\s*", body):
            if fm.start() < p:
                continue
            name, q = fm.group(1).lower(), fm.end()
            if q < len(body) and body[q] == "{":
                d, r = 1, q + 1
                while r < len(body) and d:
                    d += {"{": 1, "}": -1}.get(body[r], 0)
                    r += 1
                val, p = body[q + 1:r - 1], r
            elif q < len(body) and body[q] == '"':
                r = body.find('"', q + 1)
                val, p = body[q + 1:r], r + 1
            else:
                r = re.search(r"[,\n]", body[q:])
                val = body[q:q + r.start()] if r else body[q:]
                p = q + len(val)
            fields[name] = re.sub(r"\s+", " ", val.replace("{", "").replace("}", "")).strip()
        entries.append((etype, key, fields))
        i = k
    return entries


def bib_authors(s):
    out = []
    for a in re.split(r"\s+and\s+", s or ""):
        a = a.strip()
        if not a:
            continue
        if "," in a:
            last, first = [x.strip() for x in a.split(",", 1)]
        else:
            parts = a.split()
            last, first = parts[-1], " ".join(parts[:-1])
        initials = "".join(p[0] + "." for p in re.split(r"[\s-]+", first) if p)
        out.append(f"{last} {initials}".strip())
    return "; ".join(out)


def import_bibtex(path, cfg):
    text = open(path, encoding="utf-8-sig").read()
    tmap = {"article": "journal", "inproceedings": "conference", "conference": "conference", "proceedings": "conference",
            "book": "book", "incollection": "chapter", "inbook": "chapter", "phdthesis": "thesis", "mastersthesis": "thesis"}
    recs = []
    for etype, key, f in parse_bibtex(text):
        if not f.get("title"):
            continue
        doi = norm_doi(f.get("doi"))
        recs.append({
            "title": f["title"], "authors": bib_authors(f.get("author")), "year": f.get("year", ""),
            "type": tmap.get(etype, "other"),
            "venue": f.get("journal") or f.get("booktitle") or f.get("publisher") or f.get("school", ""),
            "volume": f.get("volume", ""), "issue": f.get("number", ""), "pages": f.get("pages", "").replace("--", "–"),
            "doi": doi, "link": f"https://doi.org/{doi}" if doi else f.get("url", ""),
            "cited_scopus": "", "abstract": clean_abstract(f.get("abstract")), "keywords": f.get("keywords", "").replace(",", ";"),
            "source": "bibtex",
        })
    return recs


# --------------------------------------------------------------------------- OpenAlex
def http_get(url, accept="application/json", timeout=30, retries=3):
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            return e.code, e.read() if hasattr(e, "read") else b""
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
    raise ConnectionError(str(last))


def openalex_base():
    return os.environ.get("OPENALEX_URL", "https://api.openalex.org").rstrip("/")


def openalex_params(extra):
    mail = os.environ.get("OPENALEX_MAILTO", "").strip()
    if mail:
        extra["mailto"] = mail
    return urllib.parse.urlencode(extra)


def abstract_from_index(inv):
    if not inv:
        return ""
    pos = {}
    for word, idxs in inv.items():
        for i in idxs:
            pos[i] = word
    return clean_abstract(" ".join(pos[i] for i in sorted(pos)))


def oa_author_name(name):
    parts = (name or "").replace(".", ". ").split()
    if not parts:
        return ""
    initials = "".join(p[0].upper() + "." for p in parts[:-1] if p[0].isalpha())
    return f"{parts[-1]} {initials}".strip()


def openalex_record(w, cfg, author_id):
    loc = w.get("primary_location") or {}
    src = loc.get("source") or {}
    t = w.get("type") or ""
    if src.get("type") == "conference" or t == "proceedings-article":
        typ = "conference"
    elif t in ("book",):
        typ = "book"
    elif t in ("book-chapter",):
        typ = "chapter"
    elif t in ("dissertation",):
        typ = "thesis"
    elif t in ("article", "review"):
        typ = "journal"
    else:
        typ = map_type(t)
    doi = norm_doi(w.get("doi"))
    b = w.get("biblio") or {}
    pages = "–".join(p for p in (b.get("first_page"), b.get("last_page")) if p)
    kws = "; ".join(k.get("display_name", "") for k in (w.get("keywords") or [])[:8])
    return {
        "title": html.unescape(w.get("title") or w.get("display_name") or "").strip(),
        "authors": "; ".join(oa_author_name((a.get("author") or {}).get("display_name")) for a in (w.get("authorships") or [])),
        "year": str(w.get("publication_year") or ""), "type": typ, "venue": src.get("display_name") or "",
        "volume": b.get("volume") or "", "issue": b.get("issue") or "", "pages": pages, "doi": doi,
        "link": f"https://doi.org/{doi}" if doi else (loc.get("landing_page_url") or w.get("id", "")),
        "cited_openalex": str(w.get("cited_by_count") or 0), "abstract": abstract_from_index(w.get("abstract_inverted_index")),
        "keywords": kws, "lab_authors": author_id, "source": "openalex", "openalex_id": (w.get("id") or "").rsplit("/", 1)[-1],
    }


def openalex_works(author):
    if author.get("openalex_id"):
        flt = f"authorships.author.id:{author['openalex_id']}"
    elif author.get("orcid"):
        flt = f"author.orcid:{author['orcid']}"
    else:
        return []
    select = "id,doi,title,display_name,publication_year,type,primary_location,cited_by_count,abstract_inverted_index,keywords,authorships,biblio"
    cursor, works = "*", []
    while cursor:
        url = f"{openalex_base()}/works?" + openalex_params({"filter": flt, "per-page": 200, "cursor": cursor, "select": select})
        status, body = http_get(url)
        if status != 200:
            raise ConnectionError(f"OpenAlex HTTP {status} for {author['name']}")
        data = json.loads(body)
        works += data.get("results", [])
        cursor = (data.get("meta") or {}).get("next_cursor")
        if not data.get("results"):
            break
    return works


def cmd_sync(cfg):
    rows = read_csv(PUB_FILE)
    th = cfg.get("title_similarity", 0.88)
    skip = set(cfg.get("openalex_skip_types", []))
    total_new = total_upd = 0
    ok_any = False
    for author in cfg["authors"]:
        try:
            works = openalex_works(author)
        except (ConnectionError, ValueError) as e:
            log(f"! OpenAlex failed for {author['name']}: {e}")
            continue
        ok_any = True
        log(f"OpenAlex: {len(works)} works for {author['name']}")
        new_recs = []
        for w in works:
            if (w.get("type") or "") in skip:
                continue
            rec = openalex_record(w, cfg, author["id"])
            if not rec["title"]:
                continue
            m = find_match(rec, rows, th)
            if m:
                before = (m.get("cited_openalex"), m.get("openalex_id"), m.get("lab_authors"))
                m["cited_openalex"] = str(max(to_int(m.get("cited_openalex")), to_int(rec["cited_openalex"])))
                m["openalex_id"] = m.get("openalex_id") or rec["openalex_id"]
                for k in ("abstract", "keywords", "doi", "volume", "issue", "pages"):
                    if not m.get(k) and rec.get(k):
                        m[k] = rec[k]
                if m.get("doi") and not m.get("link"):
                    m["link"] = "https://doi.org/" + m["doi"]
                m["lab_authors"] = ";".join(sorted(set(filter(None, (m.get("lab_authors") or "").split(";"))) | {author["id"]}))
                finalize_citations(m)
                if before != (m.get("cited_openalex"), m.get("openalex_id"), m.get("lab_authors")):
                    total_upd += 1
            elif cfg.get("sync_add_new", True):
                new_recs.append(rec)
        added, _ = add_records(rows, new_recs, cfg)
        total_new += added
    if not ok_any:
        log("No source reachable — nothing changed. Run `probe` to diagnose.")
        return 2
    # citations received per calendar year (for the chart on the website)
    by_year = {}
    for author in cfg["authors"]:
        key = f"orcid:{author['orcid']}" if author.get("orcid") else author.get("openalex_id")
        if not key:
            continue
        try:
            status, body = http_get(f"{openalex_base()}/authors/{key}?" + openalex_params({}))
            if status == 200:
                cy = json.loads(body).get("counts_by_year") or []
                by_year[author["id"]] = {str(c["year"]): c.get("cited_by_count", 0) for c in cy if c.get("year")}
        except (ConnectionError, ValueError):
            pass
    rows, merged = dedupe(rows, cfg)
    classify(rows)
    changed = write_publications(rows)
    meta_extra = {"citations_by_year": by_year} if by_year else {}
    if changed or by_year:
        write_meta(updated=now(), last_sync=now(), source="OpenAlex", papers=len(rows),
                   citations=sum(to_int(r.get("citations")) for r in rows), **meta_extra)
    log(f"sync done: {total_new} new, {total_upd} updated, {merged} duplicates merged.")
    return 0


# --------------------------------------------------------------------------- classification
def load_rules():
    rules = []
    for r in read_csv(CAT_FILE):
        kws = []
        for item in (r.get("keywords") or "").split(";"):
            item = item.strip().lower()
            if not item:
                continue
            w = 1.0
            if "*" in item:
                item, ws = item.rsplit("*", 1)
                try:
                    w = float(ws)
                except ValueError:
                    w = 1.0
            kws.append((item.strip(), w))
        rules.append({"id": r["id"], "priority": to_int(r.get("priority")) or 99, "kws": kws})
    return rules


def load_overrides():
    out = {}
    for r in read_csv(OVR_FILE):
        k = (r.get("key") or "").strip()
        if k:
            out[norm_doi(k) if "/" in k else k] = r
    return out


def score(rec, rules):
    fields = [(norm_title(rec.get("title")), 3), (norm_title(rec.get("keywords")), 2), (norm_title(rec.get("abstract")), 1)]
    scores = {}
    for rule in rules:
        s = 0.0
        for kw, w in rule["kws"]:
            k = norm_title(kw)
            if not k:
                continue
            pat = re.compile(r"(?<![a-z0-9])" + re.escape(k))
            for text, fw in fields:
                if pat.search(text):
                    s += w * fw
        scores[rule["id"]] = s
    return scores


def classify(rows):
    rules = load_rules()
    if not rules:
        log("No category rules found.")
        return rows
    prio = {r["id"]: r["priority"] for r in rules}
    fallback = max(rules, key=lambda r: r["priority"])["id"]
    ovr = load_overrides()
    for r in rows:
        o = ovr.get(norm_doi(r.get("doi"))) or ovr.get(r.get("id"))
        if o and o.get("category"):
            r["category"], r["category_source"] = o["category"].strip(), "override"
            continue
        sc = score(r, rules)
        best = max(sc, key=lambda k: (sc[k], -prio.get(k, 99)))
        r["category"] = best if sc[best] >= 3 else fallback
        r["category_source"] = "rules"
    return rows


def cmd_classify(cfg):
    rows = classify(read_csv(PUB_FILE))
    from collections import Counter
    for k, v in Counter(r["category"] for r in rows).most_common():
        log(f"  {v:3d}  {k}")
    if write_publications(rows):
        write_meta(updated=now())
    return 0


# --------------------------------------------------------------------------- import / dedupe / stats / probe
def cmd_import(cfg, files):
    rows = read_csv(PUB_FILE)
    for path in files:
        if not os.path.exists(path):
            log(f"! file not found: {path}")
            return 1
        recs = import_bibtex(path, cfg) if path.lower().endswith((".bib", ".bibtex")) else import_scopus_csv(path, cfg)
        added, updated = add_records(rows, recs, cfg)
        log(f"{os.path.basename(path)}: {len(recs)} records → {added} added, {updated} merged with existing")
    rows, merged = dedupe(rows, cfg)
    if merged:
        log(f"{merged} duplicates merged")
    for r in rows:
        r["lab_authors"] = lab_authors_for(r, cfg)
    classify(rows)
    if write_publications(rows):
        write_meta(updated=now(), last_import=now(), papers=len(rows),
                   citations=sum(to_int(r.get("citations")) for r in rows))
    return 0


def cmd_dedupe(cfg):
    rows, merged = dedupe(read_csv(PUB_FILE), cfg)
    log(f"{merged} duplicates merged")
    write_publications(rows)
    return 0


def cmd_stats(cfg):
    rows = read_csv(PUB_FILE)
    from collections import Counter
    log(f"{len(rows)} papers · {sum(to_int(r.get('citations')) for r in rows)} citations")
    log("types:", dict(Counter(r["type"] for r in rows)))
    log("categories:", dict(Counter(r["category"] for r in rows)))
    for a in cfg["authors"]:
        mine = [r for r in rows if a["id"] in (r.get("lab_authors") or "")]
        c = sorted((to_int(r.get("citations")) for r in mine), reverse=True)
        h = sum(1 for i, x in enumerate(c) if x >= i + 1)
        log(f"{a['name']}: {len(mine)} papers, {sum(c)} citations, h-index {h}")
    return 0


def cmd_probe(cfg):
    a0 = cfg["authors"][0]
    tests = [
        ("OpenAlex (author by ORCID)", f"{openalex_base()}/authors/orcid:{a0['orcid']}", lambda j: f"{j.get('display_name')} · {j.get('works_count')} works · {j.get('cited_by_count')} citations · id {str(j.get('id','')).rsplit('/',1)[-1]}"),
        ("OpenAlex (works)", f"{openalex_base()}/works?" + openalex_params({"filter": f"author.orcid:{a0['orcid']}", "per-page": 1}), lambda j: f"{(j.get('meta') or {}).get('count')} works"),
        ("Crossref", "https://api.crossref.org/works?" + urllib.parse.urlencode({"query.author": a0["name"], "rows": 0}), lambda j: f"{(j.get('message') or {}).get('total-results')} results for name"),
        ("ORCID public API", f"https://pub.orcid.org/v3.0/{a0['orcid']}/works", lambda j: f"{len(j.get('group', []))} work groups"),
        ("Semantic Scholar", "https://api.semanticscholar.org/graph/v1/author/search?" + urllib.parse.urlencode({"query": a0["name"], "limit": 1}), lambda j: f"{j.get('total')} author matches"),
        ("Google Scholar (page)", "https://scholar.google.com/citations?user=DmxtV9gAAAAJ&hl=en", None),
    ]
    log(f"{'source':30s} {'status':>7s} {'time':>7s}  details")
    log("-" * 90)
    for name, url, fmt in tests:
        t0 = time.time()
        try:
            status, body = http_get(url, accept="application/json" if fmt else "text/html", timeout=20, retries=1)
            dt = f"{time.time() - t0:.1f}s"
            if status == 200 and fmt:
                try:
                    detail = fmt(json.loads(body))
                except ValueError:
                    detail = "responded, but not JSON"
            elif status == 200:
                detail = "responds (HTML only — not used by sync; Scholar has no API)"
            else:
                detail = "not usable"
            mark = "OK " if status == 200 else "-- "
            log(f"{mark}{name:27s} {status:>7} {dt:>7s}  {detail}")
        except ConnectionError as e:
            log(f"-- {name:27s} {'error':>7s} {time.time() - t0:>6.1f}s  {str(e)[:60]}")
    log("\nsync uses OpenAlex. If it fails here, try again later or from another network (e.g. GitHub Actions).")
    return 0


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    cfg = load_config()
    cmd = argv[1]
    if cmd == "import":
        if len(argv) < 3:
            log("usage: publications.py import FILE [FILE ...]")
            return 1
        return cmd_import(cfg, argv[2:])
    return {"sync": cmd_sync, "classify": cmd_classify, "dedupe": cmd_dedupe,
            "probe": cmd_probe, "stats": cmd_stats}.get(cmd, lambda c: (log(f"unknown command: {cmd}"), 1)[1])(cfg)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
