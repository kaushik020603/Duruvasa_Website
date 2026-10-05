#!/usr/bin/env bash
# Copies the database backups, uploaded images and private files to a Cloud Storage bucket.
# The app already writes a database snapshot daily to /var/lib/duruvasa/backups; this ships it (and the files) off the VM.
#
# Setup (once):
#   gcloud storage buckets create gs://YOUR-BUCKET --location=asia-south1 --uniform-bucket-level-access
#   (the VM's service account needs Storage Object Admin on that bucket; give the VM the 'storage-rw' scope)
# Cron (as root):   17 2 * * *  BUCKET=gs://YOUR-BUCKET /usr/local/bin/duruvasa-backup
set -euo pipefail
: "${BUCKET:?Set BUCKET=gs://your-bucket}"
DATA=/var/lib/duruvasa

gcloud storage rsync --recursive "$DATA/backups"  "$BUCKET/backups"
gcloud storage rsync --recursive "$DATA/uploads"  "$BUCKET/uploads"
gcloud storage rsync --recursive "$DATA/private"  "$BUCKET/private"
echo "Backup shipped to $BUCKET at $(date -Is)"
