from sqlalchemy import Column, Integer, String, DateTime, Float, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .config import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    image_url = Column(String)
    
    option_groups = relationship("OptionGroup", back_populates="product", cascade="all, delete-orphan")

class OptionGroup(Base):
    __tablename__ = "option_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    min_selection = Column(Integer, default=0)
    max_selection = Column(Integer, default=1)
    product_id = Column(Integer, ForeignKey("products.id"))

    product = relationship("Product", back_populates="option_groups")
    options = relationship("Option", back_populates="group", cascade="all, delete-orphan")

class Option(Base):
    __tablename__ = "options"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Float, default=0.0)
    group_id = Column(Integer, ForeignKey("option_groups.id"))

    group = relationship("OptionGroup", back_populates="options")


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
