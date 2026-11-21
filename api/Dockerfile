FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY core/*.py ./core/
COPY api/*.py ./api/

USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
