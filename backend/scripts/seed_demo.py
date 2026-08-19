# scripts/seed_demo.py  -- generated from demo_plates.csv
# GRANTED / DENIED / UNKNOWN mix for the demo
#
# Run from backend/:   python scripts/seed_demo.py
# Idempotent: existing plates are updated in place, not duplicated.

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.db.models import Vehicle  # noqa: E402
from app.db.session import SessionLocal, init_db  # noqa: E402

DEMO_VEHICLES = [
    ("MH14EU3498", "R. Menon", "car", True ),   # GRANTED
    ("DL3CAY2231", "S. Kumar", "car", True ),   # GRANTED
    ("MH01BU5207", "A. Rahman", "car", True ),   # GRANTED
    ("UP32KN7325", "P. Nair", "car", True ),   # GRANTED
    ("TN28BA9999", "D. Sharma", "car", True ),   # GRANTED
    ("MH20CS4946", "V. Iyer", "car", True ),   # GRANTED
    ("KL43B2344", "M. Das", "car", True ),   # GRANTED
    ("HR26CM6005", "K. Reddy", "car", True ),   # GRANTED
    ("HR26CT4063", "T. Joseph", "car", False),   # DENIED
    ("KL65H4383", "N. Gupta", "car", False),   # DENIED
    # plates deliberately NOT registered -> UNKNOWN:
    #   WH42DE1433
    #   TN21AT0480
    #   TN28BA9999
    #   MH47N4570
]


def seed() -> None:
    init_db()
    created = updated = 0

    with SessionLocal() as db:
        for plate, owner, vtype, authorized in DEMO_VEHICLES:
            vehicle = db.scalar(select(Vehicle).where(Vehicle.plate_number == plate))
            if vehicle is None:
                db.add(
                    Vehicle(
                        plate_number=plate,
                        owner_name=owner,
                        vehicle_type=vtype,
                        is_authorized=authorized,
                    )
                )
                created += 1
            else:
                vehicle.owner_name = owner
                vehicle.vehicle_type = vtype
                vehicle.is_authorized = authorized
                updated += 1
        db.commit()

        rows = db.scalars(select(Vehicle).order_by(Vehicle.id)).all()

    print(f"seeded: {created} created, {updated} updated")
    print(f"vehicles table now holds {len(rows)} rows:")
    for v in rows:
        flag = "GRANTED" if v.is_authorized else "DENIED "
        print(f"  {v.plate_number:<12} {flag}  {v.owner_name}")


if __name__ == "__main__":
    seed()
