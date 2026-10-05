#!/usr/bin/env bash
# One-time setup of a Debian/Ubuntu Compute Engine VM for the DuRuVaSa site.
# Run as root on the VM:   sudo bash deploy/setup-vm.sh https://github.com/kaushik020603/Duruvasa_Website.git
set -euo pipefail

REPO="${1:?Usage: setup-vm.sh <git repo url>}"
APP_DIR=/opt/duruvasa
DATA_DIR=/var/lib/duruvasa

echo "==> Installing Node.js 22, Caddy and tools"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

echo "==> Creating service user and folders"
id duruvasa &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin duruvasa
mkdir -p "$APP_DIR" "$DATA_DIR" /var/log/caddy
chown -R duruvasa:duruvasa "$DATA_DIR"
chmod 700 "$DATA_DIR"

echo "==> Fetching the code and building"
[ -d "$APP_DIR/.git" ] || git clone "$REPO" "$APP_DIR"
cd "$APP_DIR"
git pull --ff-only
npm ci
npm run build
chown -R duruvasa:duruvasa "$APP_DIR"

echo "==> Configuration file (edit it, then restart)"
if [ ! -f /etc/duruvasa.env ]; then
  cat > /etc/duruvasa.env <<'EOF'
NODE_ENV=production
PORT=4180
HOST=127.0.0.1
DATA_DIR=/var/lib/duruvasa
PUBLIC_URL=https://www.duruvasa.com
ADMIN_EMAIL=rajesh@duruvasa.com
TRUST_PROXY=1
SESSION_IDLE_MINUTES=30
SESSION_MAX_HOURS=12
BACKUP_KEEP=14
# Optional email notifications (Resend). Leave blank until you have an account.
RESEND_API_KEY=
MAIL_FROM="DuRuVaSa CloudSec <noreply@duruvasa.com>"
NOTIFY_TO=info@duruvasa.com,rajesh@duruvasa.com
EOF
  chmod 600 /etc/duruvasa.env
fi

echo "==> Installing services"
cp deploy/duruvasa.service /etc/systemd/system/duruvasa.service
cp deploy/Caddyfile /etc/caddy/Caddyfile
install -m 755 deploy/backup-to-gcs.sh /usr/local/bin/duruvasa-backup
systemctl daemon-reload
systemctl enable --now duruvasa
systemctl restart caddy

sleep 3
echo
echo "==> Done. Print the one-time admin password setup link with:"
echo "      journalctl -u duruvasa --no-pager | grep -A2 'First-run setup'"
echo "    (open it within 24 hours; it is only shown on first start)"
echo "    Later, a fresh link:  cd $APP_DIR && sudo -u duruvasa env \$(cat /etc/duruvasa.env | xargs) npm run admin:link"
