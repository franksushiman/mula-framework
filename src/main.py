import os, secrets, json
from datetime import timedelta
from typing import List, Optional
from pathlib import Path
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv, set_key

from src.adapters.database.config import get_db, engine, Base
from src.adapters.database.models import Order, Product, OptionGroup, Option, Motoboy

Base.metadata.create_all(bind=engine)

app = FastAPI()
templates = Jinja2Templates(directory="src/adapters/web/templates")

# Schemas
class ItemSchema(BaseModel):
    name: str
    quantity: int
    obs: Optional[str] = None

class OrderCreateSchema(BaseModel):
    customer_name: str
    items: List[ItemSchema]

class ConfigSchema(BaseModel):
    openai_api_key: str
    maps_key: Optional[str] = ""
    asaas_key: Optional[str] = ""
    telegram_store_token: Optional[str] = ""

class MotoboyCreate(BaseModel):
    name: str
    telegram_chat_id: str

# Rotas de Configuração e QR Code
@app.get("/config", response_class=HTMLResponse)
async def config_page(request: Request):
    load_dotenv()
    return templates.TemplateResponse("config.html", {
        "request": request, 
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "maps_api_key": os.getenv("MAPS_API_KEY", ""),
        "asaas_api_key": os.getenv("ASAAS_API_KEY", ""),
        "telegram_store_token": os.getenv("TELEGRAM_STORE_TOKEN", "")
    })

@app.post("/api/config")
async def save_config(config_data: ConfigSchema):
    path = Path('.env')
    if not path.exists(): path.touch()
    set_key(".env", "OPENAI_API_KEY", config_data.openai_api_key)
    set_key(".env", "MAPS_API_KEY", config_data.maps_key)
    set_key(".env", "ASAAS_API_KEY", config_data.asaas_key)
    set_key(".env", "TELEGRAM_STORE_TOKEN", config_data.telegram_store_token)
    return {"status": "ok"}

@app.get("/api/whatsapp/qr")
async def get_qr():
    qr_path = Path("whatsapp_qr.txt")
    if qr_path.exists():
        return {"qr": qr_path.read_text()}
    return {"qr": None}

# Rotas de Pedidos e Motoboys
@app.get("/api/orders")
async def get_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).all()
    return [{"id": o.public_id, "customer": o.customer_name, "items": json.loads(o.items_json), "status": o.status} for o in orders]

@app.post("/api/orders")
async def create_order(data: OrderCreateSchema, db: Session = Depends(get_db)):
    new_order = Order(public_id=str(secrets.randbelow(900)+100), customer_name=data.customer_name, items_json=json.dumps([i.dict() for i in data.items]))
    db.add(new_order); db.commit(); return {"message": "ok"}

@app.post("/api/motoboys")
async def register_motoboy(data: MotoboyCreate, db: Session = Depends(get_db)):
    if not db.query(Motoboy).filter(Motoboy.telegram_chat_id == data.telegram_chat_id).first():
        db.add(Motoboy(name=data.name, telegram_chat_id=data.telegram_chat_id)); db.commit()
    return {"status": "ok"}

# Renderização de páginas
@app.get("/dashboard", response_class=HTMLResponse)
async def dash(request: Request): return templates.TemplateResponse("dashboard.html", {"request": request})
@app.get("/admin", response_class=HTMLResponse)
async def admin(request: Request): return templates.TemplateResponse("admin.html", {"request": request})
