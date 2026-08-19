from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Vehicle
from app.db.session import get_db

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


def _normalize(plate: str) -> str:
    return "".join(ch for ch in plate.upper() if ch.isalnum())


class VehicleCreate(BaseModel):
    plate_number: str
    owner_name: str | None = None
    phone: str | None = None
    vehicle_type: str | None = "car"
    is_authorized: bool = True

    @field_validator("plate_number")
    @classmethod
    def clean_plate(cls, v: str) -> str:
        cleaned = _normalize(v)
        if not cleaned:
            raise ValueError("plate_number cannot be empty")
        return cleaned


class VehicleUpdate(BaseModel):
    plate_number: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    vehicle_type: str | None = None
    is_authorized: bool | None = None

    @field_validator("plate_number")
    @classmethod
    def clean_plate(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = _normalize(v)
        if not cleaned:
            raise ValueError("plate_number cannot be empty")
        return cleaned


def _serialize(v: Vehicle) -> dict:
    return {
        "id": v.id,
        "plate_number": v.plate_number,
        "owner_name": v.owner_name,
        "phone": v.phone,
        "vehicle_type": v.vehicle_type,
        "is_authorized": v.is_authorized,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.get("")
def list_vehicles(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Vehicle).order_by(Vehicle.created_at.desc(), Vehicle.id.desc()))
    return {"vehicles": [_serialize(v) for v in rows]}


@router.post("", status_code=201)
def create_vehicle(payload: VehicleCreate, db: Session = Depends(get_db)) -> dict:
    vehicle = Vehicle(**payload.model_dump())
    db.add(vehicle)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"{payload.plate_number} is already registered"
        )
    db.refresh(vehicle)
    return _serialize(vehicle)


@router.patch("/{vehicle_id}")
def update_vehicle(
    vehicle_id: int, payload: VehicleUpdate, db: Session = Depends(get_db)
) -> dict:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="vehicle not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="plate already registered")
    db.refresh(vehicle)
    return _serialize(vehicle)


@router.delete("/{vehicle_id}", status_code=204, response_class=Response)
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db)) -> Response:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="vehicle not found")
    db.delete(vehicle)
    db.commit()
    return Response(status_code=204)
