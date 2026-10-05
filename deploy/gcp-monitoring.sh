#!/usr/bin/env bash
# Creates Google Cloud uptime monitoring + email alerts for the live site.
# Run from any machine with gcloud logged in:   PROJECT_ID=my-project bash deploy/gcp-monitoring.sh
#
# Creates:
#   1. An uptime check hitting https://www.duruvasa.com/api/health every minute from several regions
#   2. A second uptime check on the home page that also validates the TLS certificate
#   3. Email notification channels (info@ and rajesh@)
#   4. Alert policies: site down (2 failed checks), certificate expiring (< 14 days)
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID=your-gcp-project}"
HOST="${HOST:-www.duruvasa.com}"
EMAILS="${EMAILS:-info@duruvasa.com rajesh@duruvasa.com}"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling the Monitoring API"
gcloud services enable monitoring.googleapis.com

echo "==> Notification channels"
CHANNELS=()
for e in $EMAILS; do
  id=$(gcloud beta monitoring channels create --display-name="DuRuVaSa alerts: $e" --type=email --channel-labels="email_address=$e" --format='value(name)')
  CHANNELS+=("$id")
done
CHAN_LIST=$(IFS=,; echo "${CHANNELS[*]}")

echo "==> Uptime checks"
gcloud monitoring uptime create duruvasa-health \
  --resource-type=uptime-url --resource-labels="host=$HOST,project_id=$PROJECT_ID" \
  --protocol=https --path=/api/health --port=443 --period=1 --timeout=10 \
  --regions=asia-pacific,europe,usa-oregon --validate-ssl=true \
  --matcher-type=contains-string --matcher-content='"ok":true' \
  --display-name="DuRuVaSa API health"

gcloud monitoring uptime create duruvasa-home \
  --resource-type=uptime-url --resource-labels="host=$HOST,project_id=$PROJECT_ID" \
  --protocol=https --path=/ --port=443 --period=5 --timeout=10 \
  --regions=asia-pacific,europe --validate-ssl=true \
  --matcher-type=contains-string --matcher-content='DuRuVaSa' \
  --display-name="DuRuVaSa home page"

echo "==> Alert policies"
cat > /tmp/duruvasa-down.json <<EOF
{
  "displayName": "DuRuVaSa site is DOWN",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Health check failing",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=starts_with(\"duruvasa-health\") AND resource.type=\"uptime_url\"",
      "aggregations": [{ "alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.*"] }],
      "comparison": "COMPARISON_GT", "thresholdValue": 1, "duration": "120s"
    }
  }],
  "notificationChannels": [$(printf '"%s",' "${CHANNELS[@]}" | sed 's/,$//')],
  "documentation": { "content": "The website health check is failing from more than one region. SSH to the VM and run: systemctl status duruvasa caddy; journalctl -u duruvasa -n 100", "mimeType": "text/markdown" }
}
EOF
gcloud alpha monitoring policies create --policy-from-file=/tmp/duruvasa-down.json

cat > /tmp/duruvasa-cert.json <<EOF
{
  "displayName": "DuRuVaSa TLS certificate expiring",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Certificate expires in under 14 days",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/time_until_ssl_cert_expires\" AND resource.type=\"uptime_url\"",
      "aggregations": [{ "alignmentPeriod": "1200s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_MIN", "groupByFields": ["resource.label.*"] }],
      "comparison": "COMPARISON_LT", "thresholdValue": 14, "duration": "0s"
    }
  }],
  "notificationChannels": [$(printf '"%s",' "${CHANNELS[@]}" | sed 's/,$//')]
}
EOF
gcloud alpha monitoring policies create --policy-from-file=/tmp/duruvasa-cert.json

echo
echo "Done. View uptime checks: https://console.cloud.google.com/monitoring/uptime?project=$PROJECT_ID"
echo "Tip: also install the Ops Agent on the VM for CPU/memory/disk charts:"
echo "  curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh && sudo bash add-google-cloud-ops-agent-repo.sh --also-install"
