from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plate_number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    owner_name: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    vehicle_type: Mapped[str | None] = mapped_column(Text)
    is_authorized: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    logs: Mapped[list["AccessLog"]] = relationship(back_populates="vehicle")


class AccessLog(Base):
    __tablename__ = "access_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plate_number: Mapped[str | None] = mapped_column(Text)
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    direction: Mapped[str] = mapped_column(Text, default="in", nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    det_confidence: Mapped[float | None] = mapped_column(Float)
    ocr_confidence: Mapped[float | None] = mapped_column(Float)
    crop_path: Mapped[str | None] = mapped_column(Text)
    frame_path: Mapped[str | None] = mapped_column(Text)
    corrected_plate: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    vehicle: Mapped[Vehicle | None] = relationship(back_populates="logs")
