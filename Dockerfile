# Stage 1: Build the React 19 + Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Python FastAPI Backend + Production Image
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for build
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application backend code & data
COPY agent/ ./agent/
COPY data/ ./data/
COPY engine/ ./engine/
COPY eval/ ./eval/
COPY main.py test_api.py test_batch.py .env.example ./

# Copy built frontend assets from Stage 1 into /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose default HTTP port
EXPOSE 8000

ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Run FastAPI app with Uvicorn
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
