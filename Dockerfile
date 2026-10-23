FROM node:24-slim AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY frontend ./frontend
RUN npm run build:frontend


FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
    libgbm1 libgtk-3-0 libnspr4 libxcomposite1 libxdamage1 \
    libxrandr2 libxss1 libasound2 libdbus-1-3 fonts-liberation \
    xdg-utils wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md LICENSE ./
COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN pip install --no-cache-dir . playwright-stealth

# Install Chromium browser binary (deps already installed above)
RUN playwright install chromium

EXPOSE 8080

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
