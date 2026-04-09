#!/bin/sh
set -eu

cat >/usr/share/nginx/html/runtime-config.js <<EOF
window.__runtimeConfig = {
  apiUrl: "${API_URL:-}",
  assistantEnabled: ${ASSISTANT_ENABLED:-true},
  tourModeAlwaysOn: ${TOUR_MODE_ALWAYS_ON:-false},
  turnstileEnabled: ${TURNSTILE_ENABLED:-true},
  turnstileSiteKey: "${TURNSTILE_SITE_KEY:-}"
};
EOF
