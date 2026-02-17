import datetime
import random
from typing import List

from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from adapters.database.config import SessionLocal, engine, Base
from adapters.database.models import Order as DBOrder, OperationalLog


app = FastAPI(title="CEIA OS")

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

class OrderCreateSchema(BaseModel):
    customer_name: str
    items: List[ItemSchema]


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.post("/api/orders")
async def create_order(order_data: OrderCreateSchema, db: Session = Depends(get_db)):
    total = sum(item.price * item.quantity for item in order_data.items)
    public_id = f"#{random.randint(100, 999)}"

    # Assuming DBOrder model has `items` field that can store JSON
    db_order = DBOrder(
        public_id=public_id,
        customer_name=order_data.customer_name,
        total_value=total,
        status="RECEIVED",
        items=[item.dict() for item in order_data.items]
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    log_message = f"Novo pedido {public_id} de {order_data.customer_name} (R$ {total:.2f})"
    db_log = OperationalLog(type="ORDER_CREATED", message=log_message)
    db.add(db_log)
    db.commit()

    return {
        "order_id": public_id,
        "status": db_order.status,
        "total": total,
        "pix_payload": "BR.GOV.BCB.PIX..." # Placeholder
    }


@app.get("/api/feed")
async def get_feed(db: Session = Depends(get_db)):
    logs = db.query(OperationalLog).order_by(OperationalLog.created_at.desc()).limit(50).all()
    return [
        {
            "time": log.created_at.strftime("%H:%M"),
            "type": log.type,
            "message": log.message,
        }
        for log in logs
    ]
