#!/bin/sh
# Runs the HTTP server and the receipt-reading queue worker in one container,
# so both see the same private receipt storage.
set -e

mkdir -p storage/framework/cache storage/framework/views storage/logs storage/app/private

php artisan config:cache
php artisan route:cache
php artisan migrate --force

(while true; do php artisan queue:work --tries=1 --timeout=90 --sleep=1 --max-time=3600 || true; sleep 2; done) &

exec frankenphp php-server --root public --listen ":${PORT:-8080}"
