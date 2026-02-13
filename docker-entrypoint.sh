#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit push --force
echo "Database migrations completed."

echo "Starting application..."
exec node dist/index.js
