from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import List
import uuid
from datetime import datetime

from .core.domain.models import Order, OrderItem, OrderStatus

app = FastAPI(title="Ceia-Bistro-Hub API")

# Configuração dos templates
templates = Jinja2Templates(directory="src/adapters/web/templates")

# --- Mock Data ---
mock_orders = [
    Order(
        id=uuid.uuid4(),
        store_id="store-123",
        customer_name="João Silva",
        status=OrderStatus.CONFIRMED,
        items=[OrderItem(name="Pizza Margherita", quantity=1, price=35.50)],
        total_price=35.50,
        created_at=datetime.now()
    ),
    Order(
        id=uuid.uuid4(),
        store_id="store-123",
        customer_name="Maria Oliveira",
        status=OrderStatus.PREPARING,
        items=[
            OrderItem(name="Hamburguer Duplo", quantity=2, price=25.00),
            OrderItem(name="Batata Frita G", quantity=1, price=12.00)
        ],
        total_price=62.00,
        created_at=datetime.now()
    ),
    Order(
        id=uuid.uuid4(),
        store_id="store-123",
        customer_name="Carlos Pereira",
        status=OrderStatus.READY_FOR_PICKUP,
        items=[OrderItem(name="Açai 500ml", quantity=1, price=18.00)],
        total_price=18.00,
        created_at=datetime.now()
    ),
    Order(
        id=uuid.uuid4(),
        store_id="store-123",
        customer_name="Ana Costa",
        status=OrderStatus.DISPATCHED,
        items=[OrderItem(name="Temaki Salmão", quantity=2, price=22.00)],
        total_price=44.00,
        created_at=datetime.now()
    ),
]

# --- API Endpoints ---

@app.get("/dashboard", response_class=HTMLResponse)
async def get_dashboard(request: Request):
    """Renderiza o dashboard operacional."""
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/api/orders", response_model=List[Order])
async def get_orders():
    """Retorna uma lista de pedidos (mock)."""
    return mock_orders

# --- Health Check ---
@app.get("/health")
async def health_check():
    return {"status": "ok"}
