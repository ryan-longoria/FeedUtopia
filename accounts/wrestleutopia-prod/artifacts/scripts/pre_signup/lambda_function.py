import re

def _bad(msg):
    raise Exception(msg)

DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def lambda_handler(event, _ctx):
    attrs = event.get("request", {}).get("userAttributes", {}) or {}
    role  = (attrs.get("custom:role") or "").strip()

    if role.lower().startswith("wrestler"):
        need = {
            "given_name": "First name",
            "family_name": "Last name",
            "custom:stageName": "Stage name",
            "custom:dob": "DOB (YYYY-MM-DD)",
            "custom:city": "City",
            "custom:region": "State/Region",
            "custom:country": "Country",
        }
        missing = [label for k, label in need.items() if not (attrs.get(k) or "").strip()]
        dob = (attrs.get("custom:dob") or "").strip()
        if dob and not DOB_RE.match(dob):
            missing.append("DOB format YYYY-MM-DD")
        if missing:
            _bad("Missing/invalid required fields: " + ", ".join(missing))

    elif role.lower().startswith("promo"):
        need = {
            "custom:orgName": "Promotion/Org name",
            "custom:address": "Full address",
        }
        missing = [label for k, label in need.items() if not (attrs.get(k) or "").strip()]
        if missing:
            _bad("Missing required fields: " + ", ".join(missing))

    else:
        _bad("Unknown role; select Wrestler or Promoter.")

    return event
