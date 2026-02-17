from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from .config import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer = Column(String, index=True)
    item = Column(String)
    status = Column(String, default="CONFIRMED")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
