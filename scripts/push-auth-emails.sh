#!/usr/bin/env bash
# Sube al proyecto Supabase remoto solo las plantillas de email de supabase/templates
# (asunto + cuerpo con el código). No toca el resto de la configuración de Auth.
# Uso: SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=<ref> bash scripts/push-auth-emails.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?falta SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?falta SUPABASE_PROJECT_REF}"
subject() { awk -v t="[auth.email.template.$1]" '$0==t{f=1;next} f&&/^subject/{sub(/^subject = "/,"");sub(/"$/,"");print;exit}' supabase/config.toml; }
body=$(node -e '
const fs = require("node:fs");
const [ml, ec, mlS, ecS] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  mailer_templates_magic_link_content: fs.readFileSync(ml, "utf8"),
  mailer_templates_email_change_content: fs.readFileSync(ec, "utf8"),
  mailer_subjects_magic_link: mlS,
  mailer_subjects_email_change: ecS,
}));' supabase/templates/magic_link.html supabase/templates/email_change.html "$(subject magic_link)" "$(subject email_change)")
curl -sS --fail-with-body -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data "$body" -o /dev/stderr -w 'HTTP %{http_code}\n'
