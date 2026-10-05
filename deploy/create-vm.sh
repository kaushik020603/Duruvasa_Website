#!/usr/bin/env bash
# Creates the Compute Engine VM, a static IP and firewall rules.   PROJECT_ID=my-project bash deploy/create-vm.sh
# e2-small (2 vCPU shared, 2 GB) is plenty for this site. Region asia-south1 = Mumbai.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID=your-gcp-project}"
REGION="${REGION:-asia-south1}"
ZONE="${ZONE:-asia-south1-a}"
NAME="${NAME:-duruvasa-web}"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable compute.googleapis.com

gcloud compute addresses create "$NAME-ip" --region="$REGION" 2>/dev/null || true
IP=$(gcloud compute addresses describe "$NAME-ip" --region="$REGION" --format='value(address)')

gcloud compute instances create "$NAME" \
  --zone="$ZONE" --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --address="$IP" --tags=http-server,https-server \
  --scopes=storage-rw,logging-write,monitoring-write \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring

# Only web ports are open to the world. SSH goes through Identity-Aware Proxy (no public SSH).
gcloud compute firewall-rules create "$NAME-web" --allow=tcp:80,tcp:443 --target-tags=https-server --source-ranges=0.0.0.0/0 2>/dev/null || true
gcloud compute firewall-rules create "$NAME-iap-ssh" --allow=tcp:22 --target-tags=https-server --source-ranges=35.235.240.0/20 2>/dev/null || true

echo
echo "VM created. Point DNS (A records) for duruvasa.com AND www.duruvasa.com at: $IP"
echo "Then connect:    gcloud compute ssh $NAME --zone=$ZONE --tunnel-through-iap"
echo "And run there:   git clone https://github.com/kaushik020603/Duruvasa_Website.git && sudo bash Duruvasa_Website/deploy/setup-vm.sh https://github.com/kaushik020603/Duruvasa_Website.git"
