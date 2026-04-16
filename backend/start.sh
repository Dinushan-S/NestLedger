#!/bin/sh
PORT=${PORT:-8080}
exec uvicorn server:app --host 0.0.0.0 --port $PORT
