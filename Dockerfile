FROM python:3.12-slim

WORKDIR /app

# 安装依赖
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制代码
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# 数据目录（通过 volume 挂载）
VOLUME ["/data", "/config"]

EXPOSE 8080

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
