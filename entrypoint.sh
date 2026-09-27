#!/bin/bash
set -e

mkdir -p /data/minio

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf