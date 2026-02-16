from enum import Enum
from typing import List
from pydantic import BaseModel, Field
import uuid
from datetime import datetime

class OrderStatus(str, Enum):
    """Enumeration for order statuses."""
    DRAFT = "DRAFT"
    PENDING_PAYMENT = "PENDING_PAYMENT"
    CONFIRMED = "CONFIRMED"
    PREPARING = "PREPARING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"

class OrderItem(BaseModel):
    """Represents an item within an order."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    quantity: int
    price: float

class Order(BaseModel):
    """Represents a customer order."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    store_id: str
    customer_name: str = "Consumidor Final"
    status: OrderStatus = OrderStatus.DRAFT
    items: List[OrderItem]
    total_price: float
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
