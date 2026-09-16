#!/bin/sh
set -e

# Automatically provision default superuser admin if fresh database boot
/pb/pocketbase superuser create wade.mark.a@gmail.com HD5LGvMyEUKQcUw --dir=/pb/pb_data || true

# Start PocketBase server with automatic migrations enabled
exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
