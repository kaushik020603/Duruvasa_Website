#!/usr/bin/env bash
# Deploy a new version on the VM:   sudo bash /opt/duruvasa/deploy/update.sh
# The database and uploads live in /var/lib/duruvasa and are never touched by an update.
set -euo pipefail
cd /opt/duruvasa
sudo -u duruvasa git pull --ff-only
sudo -u duruvasa npm ci
sudo -u duruvasa npm run build
systemctl restart duruvasa
sleep 2
curl -fsS http://127.0.0.1:4180/api/health && echo " <- healthy"
