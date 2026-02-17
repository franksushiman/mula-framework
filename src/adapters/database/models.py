from sqlalchemy import Column, Integer, String, DateTime, Float, JSON
from sqlalchemy.sql import func

from .config import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String, unique=True, index=True)
    customer_name = Column(String, index=True)
    total_value = Column(Float)
    status = Column(String, default="RECEIVED")
    items_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OperationalLog(Base):
    __tablename__ = "operational_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    event_type = Column(String)
    message = Column(String)
