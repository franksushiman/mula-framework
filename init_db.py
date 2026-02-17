from src.adapters.database.config import engine, Base
from src.adapters.database.models import Order

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Database tables created.")
