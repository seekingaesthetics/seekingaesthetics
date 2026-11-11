"""Copies Live schools from Airtable into data/schools.json for the website.

Runs in GitHub Actions (see .github/workflows/airtable-sync.yml).
Needs two repository secrets: AIRTABLE_TOKEN (read-only) and AIRTABLE_BASE_ID.

Privacy rule: only the fields listed below are ever copied. Anything else in
Airtable (Admissions email, Private notes, billing, plan price) never leaves Airtable.
Free schools get only name, city, state, formats, website and program names,
even if other fields are filled in.
"""
import io, json, os, re, sys, urllib.parse, urllib.request
from datetime import date

TOKEN = os.environ.get("AIRTABLE_TOKEN", "").strip()
BASE = os.environ.get("AIRTABLE_BASE_ID", "").strip()
OUT = "data/schools.json"
PHOTO_DIR = "img/schools"
MAX_PHOTOS = 5

if not TOKEN or not BASE:
    sys.exit("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID secret.")


def fetch_table(name):
    rows, offset = [], None
    while True:
        q = {"pageSize": "100"}
        if offset:
            q["offset"] = offset
        url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(name)}?{urllib.parse.urlencode(q)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"Airtable said {e.code} reading the '{name}' table. Check the table name and the token's access.")
        rows += data.get("records", [])
        offset = data.get("offset")
        if not offset:
            return rows


def text(v):
    if v is None:
        return ""
    if isinstance(v, list):
        return ", ".join(str(x) for x in v)
    return str(v).strip()


def money_or_text(v):
    """'$9,800' or 9800 -> 9800 (so 'Tuition from' can find the lowest). Anything else stays text."""
    t = text(v)
    plain = t.replace("$", "").replace(",", "").strip()
    if re.fullmatch(r"\d+(\.\d+)?", plain):
        n = float(plain)
        return int(n) if n.is_integer() else n
    return t


def hours(v):
    t = text(v).replace(",", "")
    m = re.fullmatch(r"\s*(\d+)\s*(hours?|hrs?)?\s*", t, re.I)
    return int(m.group(1)) if m else t


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", " and ")).strip("-")
    return s or "school"


def save_photos(slug, attachments):
    """Airtable photo links expire after a few hours, so photos are copied onto the site."""
    from PIL import Image
    saved = []
    for i, a in enumerate((attachments or [])[:MAX_PHOTOS], start=1):
        if not str(a.get("type", "")).startswith("image/"):
            continue
        try:
            with urllib.request.urlopen(a["url"], timeout=60) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as e:  # one bad photo should not stop the whole update
            print(f"  skipped a photo for {slug}: {e}")
            continue
        im.thumbnail((1400, 1400))
        path = f"{PHOTO_DIR}/{slug}-{i}.jpg"
        im.save(path, "JPEG", quality=78, optimize=True, progressive=True)
        saved.append(path)
    return saved


schools_raw = fetch_table("Schools")
programs_raw = fetch_table("Programs")
print(f"Read {len(schools_raw)} rows from Schools and {len(programs_raw)} from Programs.")

programs_by_school = {}
for p in programs_raw:
    f = p.get("fields", {})
    if not text(f.get("Program name")):
        continue
    for school_id in f.get("School", []) or []:
        programs_by_school.setdefault(school_id, []).append({
            "name": text(f.get("Program name")),
            "tuition": money_or_text(f.get("Tuition")),
            "hours": hours(f.get("Hours")),
            "schedule": text(f.get("Schedule")),
            "nextStart": text(f.get("Next start")),
        })

os.makedirs(PHOTO_DIR, exist_ok=True)
for old in os.listdir(PHOTO_DIR):
    os.remove(os.path.join(PHOTO_DIR, old))

out, used = [], set()
for r in schools_raw:
    f = r.get("fields", {})
    name = text(f.get("School name"))
    if not name or text(f.get("Status")) != "Live":
        continue
    slug = slugify(name)
    n = 2
    while slug in used:
        slug = f"{slugify(name)}-{n}"
        n += 1
    used.add(slug)
    paid = text(f.get("Listing type")) == "Paid"
    s = {
        "id": r["id"],
        "slug": slug,
        "name": name,
        "city": text(f.get("City")),
        "state": text(f.get("State")).upper(),
        "listing": "paid" if paid else "free",
        "formats": f.get("Formats") or [],
        "website": text(f.get("Website")),
    }
    if paid:
        s.update({
            "scheduleSummary": text(f.get("Schedule summary")),
            "tags": [t.strip() for t in text(f.get("Tags")).split(",") if t.strip()],
            "aid": text(f.get("Financial aid")),
            "photos": save_photos(slug, f.get("Photos")),
            "programs": programs_by_school.get(r["id"], []),
            "openHouse": {"date": text(f.get("Open house date")), "title": text(f.get("Open house title"))}
                         if text(f.get("Open house date")) else None,
            "parents": {
                "totalCost": money_or_text(f.get("Total cost incl. kit")),
                "aid": text(f.get("Financial aid")),
                "accreditation": text(f.get("Accreditation")),
                "stateLicense": text(f.get("State license info")),
            },
        })
    else:
        s["programs"] = [{"name": p.strip()} for p in text(f.get("Program names")).split(",") if p.strip()]
    out.append(s)

live_paid = sum(1 for s in out if s["listing"] == "paid")
print(f"{len(out)} Live schools ({live_paid} Featured, {len(out) - live_paid} free).")

current_is_sample = False
try:
    current_is_sample = bool(json.load(open(OUT)).get("sample"))
except Exception:
    pass
if not out and current_is_sample:
    print("No schools are set to Live yet, so the sample schools stay in place for now.")
    sys.exit(0)

with open(OUT, "w") as fh:
    json.dump({"sample": False, "generated": date.today().isoformat(), "schools": out}, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
print(f"Wrote {OUT}.")
