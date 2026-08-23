FROM python:3.13-alpine

WORKDIR /app
COPY server.py .

ENV DB_PATH=/data/app.sqlite3
EXPOSE 3000

CMD ["python", "server.py"]
