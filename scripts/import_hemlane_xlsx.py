#!/usr/bin/env python3
"""
One-shot bulk import of Hemlane prospect xlsx exports → leads table.
Mirrors agent-hemlane-parser/index.ts behavior (dedup, score boosts, consent).
Usage: python3 import_hemlane_xlsx.py [--dry-run]
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

# ---------------- Config ----------------

LEADS_DIR = Path.home() / "Desktop" / "Leads"
ORG_ID = "522f7afe-c254-42d4-86f0-8592539ea4aa"  # rent-finder-cleveland
PROJECT_REF = "glzzzthgotfwoiaranmp"
MGMT_TOKEN = os.environ.get("SUPABASE_MGMT_TOKEN", "")
if not MGMT_TOKEN:
    sys.exit("ERROR: set SUPABASE_MGMT_TOKEN env var (Supabase Management API token).")
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

EXCLUDED_DOMAINS = ("hemlane.com", "rentfindercleveland.com", "inbound.rentfindercleveland.com")

UNIT_DESC = {"A": "A (Downstairs)", "B": "B (Upstairs)"}

# (address from xlsx) -> {forced_unit_letter -> property_id}
PROPERTY_MAP = {
    "2548 North 38th Street, Milwaukee, WI 53210": {
        "A": "68186a26-35d5-4222-ba93-fe7ae63f3dac",
        "B": "3d0153a9-abe6-475e-9d60-8f55c3e7a9e5",
    },
    "2955 North 17th Street, Milwaukee, WI 53206": {
        "A": "8289b69f-bc57-4325-a13a-88472d994419",
        "B": "d49c66f7-0953-480c-981d-0068239ffaf8",
    },
    "3151 North 11th Street, Milwaukee, WI 53206": {
        "A": "f17be2d8-44cf-4ab9-8da6-b4ac32bfdaa9",
        "B": "fe8dd5d5-d42e-43e5-8bef-90574cac72d4",
    },
    "3180 North 15th Street, Milwaukee, WI 53206": {
        "A": "ae11ae84-1702-4751-a305-cfe8ef9d1a1a",
        "B": "ce96978b-f965-4a49-b7eb-c8bc9ba1cc16",
    },
}

def street_only(full_address: str) -> str:
    """Strip city/state/zip — match existing source_detail format."""
    return full_address.split(",")[0].strip()

def build_source_detail(address: str, unit_letter: str, listing_site: str) -> str:
    return f"Property: {street_only(address)}, Unit {UNIT_DESC[unit_letter]} (via {listing_site or 'Hemlane'})"

# ---------------- DB helper (uses curl to avoid Cloudflare 1010) ----------------

def db_query(sql: str) -> list:
    """Execute SQL via Management API. Returns list of dicts."""
    payload = json.dumps({"query": sql})
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", API_URL,
         "-H", f"Authorization: Bearer {MGMT_TOKEN}",
         "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        raise RuntimeError(f"curl failed: {r.stderr}")
    try:
        data = json.loads(r.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"non-JSON response: {r.stdout[:300]}")
    if isinstance(data, dict) and "message" in data:
        raise RuntimeError(f"API error: {data}")
    return data

def sql_str(s):
    """Escape string for inline SQL."""
    if s is None:
        return "NULL"
    s = str(s).replace("'", "''")
    return f"'{s}'"

# ---------------- Validation / normalization ----------------

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w.-]+\.\w{2,}$")

def normalize_email(raw):
    if not raw:
        return None
    e = str(raw).strip().lower()
    if not EMAIL_RE.match(e):
        return None
    if any(e.endswith(d) for d in EXCLUDED_DOMAINS):
        return None
    return e

def normalize_phone(raw):
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) < 7:
        return None
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits[0] == "1":
        return "+" + digits
    if 7 <= len(digits) <= 15:
        return "+" + digits
    return None

def parse_db_ts(s):
    """Parse a Postgres timestamp string like '2026-05-22 00:08:18.475+00'."""
    if not s:
        return None
    try:
        # Normalize: replace space with T, ensure timezone present
        s2 = s.replace(" ", "T", 1)
        # Postgres uses +00 (no minutes); Python wants +00:00
        if re.search(r"[+-]\d{2}$", s2):
            s2 = s2 + ":00"
        elif not re.search(r"[+-]\d{2}:\d{2}$", s2) and not s2.endswith("Z"):
            s2 = s2 + "+00:00"
        return datetime.fromisoformat(s2)
    except Exception:
        return None

def split_name(full):
    if not full:
        return None, None, None
    full = full.strip()[:100]
    parts = full.split(None, 1)
    if len(parts) == 1:
        return full, parts[0], None
    return full, parts[0], parts[1]

# ---------------- File parsing ----------------

UNIT_RE = re.compile(r"Unit\s+([AB])\b", re.IGNORECASE)

def parse_files():
    """Read all xlsx, return list of raw inquiries with forced unit from filename."""
    rows = []
    for f in sorted(LEADS_DIR.glob("*.xlsx")):
        m = UNIT_RE.search(f.name)
        if not m:
            print(f"  WARN: cannot extract Unit from filename: {f.name}", file=sys.stderr)
            continue
        forced_unit = m.group(1).upper()
        wb = openpyxl.load_workbook(f, data_only=True)
        ws = wb.active
        for r in list(ws.iter_rows(values_only=True))[1:]:
            if not r[0]:
                continue
            address_raw = r[6]
            if address_raw not in PROPERTY_MAP:
                print(f"  WARN: unknown address '{address_raw}' in {f.name}", file=sys.stderr)
                property_id = None
            else:
                property_id = PROPERTY_MAP[address_raw].get(forced_unit)
                if not property_id:
                    print(f"  WARN: no UUID for {address_raw} unit {forced_unit}", file=sys.stderr)
            rows.append({
                "file": f.name,
                "forced_unit": forced_unit,
                "contact_name": r[0],
                "email_raw": r[1],
                "phone_raw": r[2],
                "lead_type": r[3],
                "lead_source": r[4],
                "listing_site": r[5],
                "address": address_raw,
                "internal_unit": r[7],
                "private_notes": r[8],
                "created_at": r[9],
                "property_id": property_id,
            })
    return rows

# ---------------- Intra-import dedup ----------------

def dedup_contacts(raw_rows):
    """
    Group raw rows by global contact identity (email-first, phone-fallback, name-fallback).
    Returns list of unique contacts; each has 'primary' (most recent inquiry) and 'extras' (other inquiries).
    """
    groups = defaultdict(list)
    for r in raw_rows:
        email = normalize_email(r["email_raw"])
        phone = normalize_phone(r["phone_raw"])
        if email:
            key = ("email", email)
        elif phone:
            key = ("phone", phone)
        else:
            key = ("name", (r["contact_name"] or "").strip().lower())
        r["_email"] = email
        r["_phone"] = phone
        groups[key].append(r)

    contacts = []
    for key, rs in groups.items():
        rs_sorted = sorted(rs, key=lambda x: x["created_at"] or 0)
        primary = rs_sorted[-1]  # most recent = primary
        extras = rs_sorted[:-1]
        # If primary lacks email/phone but some extra has it, fill in
        merged_email = primary["_email"] or next((x["_email"] for x in rs_sorted if x["_email"]), None)
        merged_phone = primary["_phone"] or next((x["_phone"] for x in rs_sorted if x["_phone"]), None)
        primary["_email"] = merged_email
        primary["_phone"] = merged_phone
        contacts.append({"primary": primary, "extras": extras, "key": key})
    return contacts

# ---------------- DB ops ----------------

def find_existing_lead(email, phone):
    """Match parser dedup logic (phone-first, then email)."""
    if phone:
        rows = db_query(
            f"SELECT id, full_name, email, phone, interested_property_id, source_detail, lead_score, last_contact_at, created_at "
            f"FROM leads WHERE organization_id = {sql_str(ORG_ID)} AND phone = {sql_str(phone)} LIMIT 1;"
        )
        if rows:
            return rows[0]
    if email:
        rows = db_query(
            f"SELECT id, full_name, email, phone, interested_property_id, source_detail, lead_score, last_contact_at, created_at "
            f"FROM leads WHERE organization_id = {sql_str(ORG_ID)} AND email = {sql_str(email)} LIMIT 1;"
        )
        if rows:
            return rows[0]
    return None

def insert_lead(contact, dry_run):
    primary = contact["primary"]
    full_name, first, last = split_name(primary["contact_name"])
    email = primary["_email"]
    phone = primary["_phone"]
    if not email and not phone:
        return None, "skipped_no_contact"

    created_at = primary["created_at"]
    if created_at is None:
        return None, "skipped_no_date"
    iso_ts = created_at.isoformat()

    fingerprint = hashlib.sha256(
        f"{full_name}|{email}|{phone}|{primary['address']}|{primary['forced_unit']}|{iso_ts}".encode()
    ).hexdigest()[:16]
    hemlane_email_id = f"bulk_import_{fingerprint}"

    source_detail = build_source_detail(primary["address"], primary["forced_unit"], primary["listing_site"])

    sql = f"""
INSERT INTO leads (
  organization_id, full_name, first_name, last_name, phone, email,
  source, source_detail, status, hemlane_email_id, interested_property_id,
  sms_consent, sms_consent_at, call_consent, call_consent_at,
  created_at, updated_at
) VALUES (
  {sql_str(ORG_ID)}, {sql_str(full_name)}, {sql_str(first)}, {sql_str(last)},
  {sql_str(phone)}, {sql_str(email)},
  'hemlane_email', {sql_str(source_detail)}, 'new',
  {sql_str(hemlane_email_id)}, {sql_str(primary['property_id'])},
  true, {sql_str(iso_ts)}, true, {sql_str(iso_ts)},
  {sql_str(iso_ts)}, {sql_str(iso_ts)}
) RETURNING id;
"""
    if dry_run:
        return "dry-run-uuid", "new"
    rows = db_query(sql)
    if not rows:
        return None, "insert_failed"
    return rows[0]["id"], "new"

def update_lead_if_needed(existing, contact, dry_run):
    """UPDATE only if there's a meaningful data change (missing email/phone filled, OR
    property association changed AND our xlsx inquiry is newer than DB last_contact_at).
    source_detail format differences alone do NOT trigger an update.
    Returns ('updated'|'noop')."""
    primary = contact["primary"]
    email = primary["_email"]
    phone = primary["_phone"]
    new_pid = primary["property_id"]
    primary_ts = primary["created_at"]

    sets = []
    if email and not existing.get("email"):
        sets.append(f"email = {sql_str(email)}")
    if phone and not existing.get("phone"):
        sets.append(f"phone = {sql_str(phone)}")
    if new_pid and new_pid != existing.get("interested_property_id"):
        # Only overwrite property if our xlsx inquiry is more recent than DB's last contact
        db_last_str = existing.get("last_contact_at") or existing.get("created_at")
        is_newer = False
        if db_last_str and primary_ts:
            db_last_dt = parse_db_ts(db_last_str)
            primary_dt = primary_ts.replace(tzinfo=timezone.utc) if primary_ts.tzinfo is None else primary_ts
            if db_last_dt and primary_dt:
                is_newer = primary_dt > db_last_dt
        if is_newer:
            sets.append(f"interested_property_id = {sql_str(new_pid)}")
            new_detail = build_source_detail(primary["address"], primary["forced_unit"], primary["listing_site"])
            sets.append(f"source_detail = {sql_str(new_detail)}")

    if not sets:
        return "noop"

    sets.append("updated_at = NOW()")
    sets.append("last_contact_at = NOW()")
    sql = f"UPDATE leads SET {', '.join(sets)} WHERE id = {sql_str(existing['id'])};"
    if dry_run:
        return "updated"
    db_query(sql)
    return "updated"

def insert_consent_and_score(lead_id, contact, dry_run):
    """Post-insert side effects: consent_log × 3 + score boosts."""
    if dry_run:
        return
    primary = contact["primary"]
    email = primary["_email"]
    phone = primary["_phone"]
    iso_ts = primary["created_at"].isoformat()

    # consent_log × 3
    evidence = f"Bulk import from Hemlane xlsx export ({primary['file'][:50]})"
    for ctype in ("automated_calls", "sms_marketing", "email_marketing"):
        db_query(
            f"INSERT INTO consent_log (organization_id, lead_id, consent_type, granted, method, evidence_text, created_at) "
            f"VALUES ({sql_str(ORG_ID)}, {sql_str(lead_id)}, {sql_str(ctype)}, true, 'listing_inquiry', {sql_str(evidence)}, {sql_str(iso_ts)});"
        )

    # Score boosts (mirrors parser)
    boosts = [
        (10, "inbound_inquiry", "Lead initiated contact via Hemlane property listing"),
    ]
    if email and phone:
        boosts.append((5, "complete_contact", "Both email and phone provided"))
    if primary["property_id"]:
        boosts.append((10, "property_matched", f"Matched to property {primary['address']} Unit {primary['forced_unit']}"))

    for amount, code, text in boosts:
        db_query(
            f"SELECT log_score_change("
            f"{sql_str(lead_id)}::uuid, {amount}, {sql_str(code)}, {sql_str(text)}, "
            f"'engagement'::text, NULL, NULL, NULL, 'bulk_import'::text"
            f");"
        )

def insert_extra_inquiry_notes(lead_id, contact, dry_run):
    """For multi-property contacts: one lead_note per extra inquiry."""
    if dry_run or not contact["extras"]:
        return
    for x in contact["extras"]:
        date_str = x["created_at"].strftime("%Y-%m-%d") if x["created_at"] else "unknown date"
        unit = x["forced_unit"]
        content = (
            f"[Hemlane historical import] Also inquired about {x['address']}, Unit {unit} "
            f"on {date_str} via {x['listing_site'] or 'Hemlane'}"
        )
        db_query(
            f"INSERT INTO lead_notes (organization_id, lead_id, content, note_type, is_pinned, created_at, updated_at) "
            f"VALUES ({sql_str(ORG_ID)}, {sql_str(lead_id)}, {sql_str(content)}, 'general', false, NOW(), NOW());"
        )

# ---------------- Main ----------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Compute report without writing to DB")
    args = parser.parse_args()

    t0 = time.time()
    print("=" * 65)
    print(f"  Bulk Hemlane Import {'(DRY RUN)' if args.dry_run else '(LIVE)'}")
    print("=" * 65)

    raw_rows = parse_files()
    print(f"\nFiles read:                            {len(set(r['file'] for r in raw_rows))}")
    print(f"Total xlsx rows:                       {len(raw_rows)}")

    # Skip stats
    skipped_no_contact = 0
    skipped_excluded = 0
    for r in raw_rows:
        e = normalize_email(r["email_raw"])
        p = normalize_phone(r["phone_raw"])
        if not e and not p:
            skipped_no_contact += 1
        if r["email_raw"] and not e:
            # check if it was the domain exclusion
            raw_lower = str(r["email_raw"]).strip().lower()
            if any(raw_lower.endswith(d) for d in EXCLUDED_DOMAINS):
                skipped_excluded += 1

    contacts = dedup_contacts(raw_rows)
    multi_contacts = [c for c in contacts if c["extras"]]
    total_extras = sum(len(c["extras"]) for c in contacts)

    print(f"Skipped (no contact info):             {skipped_no_contact}")
    print(f"Skipped (excluded email domain):       {skipped_excluded}")
    print(f"Unique contacts after intra-dedup:     {len(contacts)}")
    print(f"Multi-property contacts:               {len(multi_contacts)} (with {total_extras} extra inquiries)")
    print()

    new_count = 0
    updated_count = 0
    noop_count = 0
    error_count = 0
    no_property_match = 0
    new_lead_ids = []

    update_details = []
    for i, contact in enumerate(contacts):
        primary = contact["primary"]
        if not primary["property_id"]:
            no_property_match += 1
        try:
            existing = find_existing_lead(primary["_email"], primary["_phone"])
            if existing:
                outcome = update_lead_if_needed(existing, contact, args.dry_run)
                if outcome == "updated":
                    updated_count += 1
                    update_details.append({
                        "name": primary["contact_name"],
                        "email": primary["_email"],
                        "db_pid": existing.get("interested_property_id"),
                        "new_pid": primary["property_id"],
                        "db_last_contact": existing.get("last_contact_at"),
                        "xlsx_inquiry": primary["created_at"].isoformat() if primary["created_at"] else None,
                    })
                else:
                    noop_count += 1
            else:
                lead_id, outcome = insert_lead(contact, args.dry_run)
                if outcome == "new":
                    new_count += 1
                    new_lead_ids.append(lead_id)
                    insert_consent_and_score(lead_id, contact, args.dry_run)
                else:
                    error_count += 1
                    print(f"  [{i}] skipped: {outcome} for {primary['contact_name']}")
        except Exception as e:
            error_count += 1
            print(f"  [{i}] ERROR for {primary['contact_name']}: {e}", file=sys.stderr)

        if (i + 1) % 20 == 0:
            print(f"  ... processed {i+1}/{len(contacts)}")

    elapsed = time.time() - t0
    print()
    print("=" * 65)
    print("  REPORT")
    print("=" * 65)
    print(f"Files read:                            {len(set(r['file'] for r in raw_rows))}")
    print(f"Total xlsx rows:                       {len(raw_rows)}")
    print(f"Unique contacts after intra-dedup:     {len(contacts)}")
    print(f"Multi-property contacts:               {len(multi_contacts)} (with {total_extras} extra inquiries)")
    print()
    print(f"DB outcomes:")
    print(f"  NEW (inserted):                      {new_count}")
    print(f"  UPDATED (existing, enriched):        {updated_count}")
    print(f"  NOOP (already up-to-date):           {noop_count}")
    print(f"  ERRORS:                              {error_count}")
    print()
    print(f"Property matching:                     {len(contacts) - no_property_match} / {len(contacts)}")
    print(f"Mode:                                  {'DRY RUN — no changes written' if args.dry_run else 'LIVE — committed to DB'}")
    print(f"Time:                                  {elapsed:.1f}s")
    print("=" * 65)

    if update_details:
        print("\nUPDATES detail (xlsx inquiry newer than DB last_contact_at):")
        for u in update_details:
            print(f"  {u['name']:30s} | {u['email'] or '(no email)':35s}")
            print(f"    DB property: {u['db_pid']}  ->  new: {u['new_pid']}")
            print(f"    DB last_contact_at: {u['db_last_contact']}  |  xlsx inquiry: {u['xlsx_inquiry']}")
        print()

if __name__ == "__main__":
    main()
