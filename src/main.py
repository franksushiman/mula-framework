import datetime
import random
import json
from typing import List, Optional

import secrets
from datetime import timedelta
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from adapters.database.config import SessionLocal, engine, Base
from adapters.database.models import Order as DBOrder, OperationalLog


app = FastAPI(title="CEIA OS")

security = HTTPBasic()

# Cria as tabelas no banco de dados, se não existirem
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configura os templates
templates = Jinja2Templates(directory="src/adapters/web/templates")


# Pydantic models (Schemas)
class ItemSchema(BaseModel):
    name: str
    quantity: int
    price: float
    obs: Optional[str] = None

class OrderCreateSchema(BaseModel):
    customer_name: str
    items: List[ItemSchema]


# Basic Auth dependency
def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, "admin")
    correct_password = secrets.compare_digest(credentials.password, "ceia")
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Acesso não autorizado",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, username: str = Depends(get_current_username)):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request, username: str = Depends(get_current_username)):
    return templates.TemplateResponse("admin.html", {"request": request})


@app.get("/cadastro")
async def redirect_to_admin():
    return RedirectResponse(url="/admin")


@app.get("/cardapio", response_class=HTMLResponse)
async def menu_page(request: Request):
    # Em um aplicativo real, você buscaria isso do banco de dados
    dummy_menu_items = [
        {
            "name": "Hambúrguer Clássico",
            "description": "Pão, carne, queijo, alface, tomate e molho especial.",
            "price": 25.50,
            "image_url": "https://plus.unsplash.com/premium_photo-1673588224923-374750a2c714?w=500"
        },
        {
            "name": "Batata Frita",
            "description": "Porção generosa de batatas fritas crocantes e douradas.",
            "price": 12.00,
            "image_url": "https://images.unsplash.com/photo-1541592106381-b6d9604c784b?w=500"
        },
        {
            "name": "Refrigerante",
            "description": "Lata 350ml, diversos sabores.",
            "price": 5.00,
            "image_url": "https://images.unsplash.com/photo-1572490122219-2a3ab2c59b57?w=500"
        }
    ]
    return templates.TemplateResponse("menu_dynamic.html", {"request": request, "menu_items": dummy_menu_items})


@app.post("/api/orders")
async def create_order(order_data: OrderCreateSchema, db: Session = Depends(get_db)):
    total = sum(item.price * item.quantity for item in order_data.items)
    public_id = f"{random.randint(1000, 9999)}"

    # Assuming DBOrder model has `items` field that can store JSON
    db_order = DBOrder(
        public_id=public_id,
        customer_name=order_data.customer_name,
        total_value=total,
        status="CONFIRMED",
        items_json=json.dumps([item.dict(exclude_none=True) for item in order_data.items])
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    log_message = f"Novo pedido {public_id} de {order_data.customer_name} (R$ {total:.2f})"
    db_log = OperationalLog(event_type="ORDER_CREATED", message=log_message)
    db.add(db_log)
    db.commit()

    return {
        "order_id": public_id,
        "status": db_order.status,
        "total": total,
        "pix_payload": "BR.GOV.BCB.PIX..." # Placeholder
    }


@app.get("/api/orders")
async def get_orders(db: Session = Depends(get_db)):
    active_statuses = ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"]
    orders_from_db = db.query(DBOrder).filter(DBOrder.status.in_(active_statuses)).order_by(DBOrder.created_at.asc()).all()
    
    result = []
    for order in orders_from_db:
        # Converte o horário de criação para o fuso de Brasília (UTC-3)
        created_at_brt = order.created_at - timedelta(hours=3)
        
        result.append({
            "id": order.public_id,
            "customer": order.customer_name,
            "items": json.loads(order.items_json),
            "status": order.status,
            "created_at_brt": created_at_brt.strftime("%H:%M")
        })
    return result


@app.patch("/api/orders/{order_id}/advance")
async def advance_order_status(order_id: str, db: Session = Depends(get_db)):
    db_order = db.query(DBOrder).filter(DBOrder.public_id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")

    status_flow = {
        "CONFIRMED": "PREPARING",
        "PREPARING": "READY_FOR_PICKUP",
        "READY_FOR_PICKUP": "DELIVERED",
    }
    
    new_status = status_flow.get(db_order.status)
    
    if new_status:
        db_order.status = new_status
        log_message = f"Pedido #{db_order.public_id} ({db_order.customer_name}) atualizado para {new_status}"
        db_log = OperationalLog(event_type="ORDER_STATUS_UPDATE", message=log_message)
        db.add(db_log)
        db.commit()
        return {"message": "Order status advanced", "new_status": new_status}
    
    return {"message": "Order cannot be advanced", "status": db_order.status}


@app.get("/api/feed")
async def get_feed(db: Session = Depends(get_db)):
    logs = db.query(OperationalLog).order_by(OperationalLog.timestamp.desc()).limit(50).all()
    return [
        {
            "time": log.timestamp.strftime("%H:%M"),
            "type": log.event_type,
            "message": log.message,
        }
        for log in logs
    ]
