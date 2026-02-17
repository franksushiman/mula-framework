from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="CEIA OS")

# Configura os templates
templates = Jinja2Templates(directory="src/adapters/web/templates")

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/api/orders")
async def get_orders():
    # Mock de pedidos seguindo o domínio do Ceia
    return [
        {"id": "1", "status": "CONFIRMED", "item": "Sushi Combo A", "customer": "Frank"},
        {"id": "2", "status": "PREPARING", "item": "Temaki Salmão", "customer": "Maria"},
        {"id": "3", "status": "READY_FOR_PICKUP", "item": "Uramaki", "customer": "Jose"}
    ]
