import datetime
from typing import List

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from adapters.database.config import SessionLocal
from adapters.database.models import Order as DBOrder


app = FastAPI(title="CEIA OS")

# Configura os templates
templates = Jinja2Templates(directory="src/adapters/web/templates")


# Pydantic models (Schemas)
class OrderCreate(BaseModel):
    customer: str
    item: str


class Order(BaseModel):
    id: int
    customer: str
    item: str
    status: str
    created_at: datetime.datetime

    class Config:
        orm_mode = True


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

@app.get("/api/orders", response_model=List[Order])
async def get_orders(db: Session = Depends(get_db)):
    return db.query(DBOrder).all()


@app.post("/webhook/fake-whatsapp", response_model=Order)
async def create_order_from_webhook(order: OrderCreate, db: Session = Depends(get_db)):
    db_order = DBOrder(customer=order.customer, item=order.item, status="CONFIRMED")
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


@app.patch("/api/orders/{order_id}/advance", response_model=Order)
async def advance_order_status(order_id: int, db: Session = Depends(get_db)):
    db_order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    status_transitions = {
        "CONFIRMED": "PREPARING",
        "PREPARING": "READY_FOR_PICKUP",
        "READY_FOR_PICKUP": "DISPATCHED",
    }

    if db_order.status in status_transitions:
        db_order.status = status_transitions[db_order.status]
        db.commit()
        db.refresh(db_order)

    return db_order
