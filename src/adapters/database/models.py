from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from src.adapters.database.config import Base

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String, unique=True)
    customer_name = Column(String)
    items_json = Column(Text)
    status = Column(String, default="RECEIVED")
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    price = Column(Float)
    option_groups = relationship("OptionGroup", back_populates="product")

class OptionGroup(Base):
    __tablename__ = "option_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    min_selection = Column(Integer, default=0)
    max_selection = Column(Integer, default=1)
    product_id = Column(Integer, ForeignKey("products.id"))
    product = relationship("Product", back_populates="option_groups")
    options = relationship("Option", back_populates="group")

class Option(Base):
    __tablename__ = "options"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    price = Column(Float)
    group_id = Column(Integer, ForeignKey("option_groups.id"))
    group = relationship("OptionGroup", back_populates="options")

class Motoboy(Base):
    __tablename__ = "motoboys"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    telegram_chat_id = Column(String, unique=True)
