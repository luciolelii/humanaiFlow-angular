#!/bin/sh
set -eu

cat >/usr/share/nginx/html/runtime-config.js <<EOF
window.__runtimeConfig = {
  turnstileSiteKey: "${TURNSTILE_SITE_KEY:-}"
};
EOF
