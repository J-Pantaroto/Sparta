FROM python:3.13-slim

WORKDIR /app
COPY services/analyzer/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir "fastapi>=0.115.0" "uvicorn[standard]>=0.30.0" "pydantic>=2.8.0"
COPY services/analyzer/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
