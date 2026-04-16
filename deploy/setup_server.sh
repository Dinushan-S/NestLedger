#!/bin/bash
# Initial setup script for NestLedger backend server
# Run this once on a fresh server
# After this script, trigger a GitHub Actions deploy to write .env and start the service

set -e

DOMAIN="nestledger.dinushan.dev"
APP_PORT=8000
APP_DIR="/opt/NestLedger/backend"

echo "=== Detecting server IP ==="
SERVER_IP=$(curl -sf ifconfig.me 2>/dev/null || curl -sf icanhazip.com 2>/dev/null)
if [ -z "$SERVER_IP" ]; then
    echo "ERROR: Could not auto-detect server IP. Set SERVER_IP manually."
    exit 1
fi
echo "Server IP: $SERVER_IP"

echo "=== Installing system dependencies ==="
apt update
apt install -y python3.11 python3.11-venv python3-pip git nginx certbot python3-certbot-nginx

echo "=== Cloning repository ==="
if [ -d "/opt/NestLedger" ]; then
    echo "Repository already exists at /opt/NestLedger, pulling latest..."
    cd /opt/NestLedger
    git fetch origin
    git reset --hard origin/main
else
    cd /opt
    git clone https://github.com/Dinushan-S/NestLedger.git
fi
cd "$APP_DIR"

echo "=== Setting up Python environment ==="
if [ -d "venv" ]; then
    echo "Virtual environment already exists, updating packages..."
else
    python3.11 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/nestledger.service << EOF
[Unit]
Description=NestLedger FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
ExecStart=$APP_DIR/venv/bin/uvicorn server:app --host 0.0.0.0 --port $APP_PORT
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nestledger

echo "=== Configuring Nginx reverse proxy ==="
cat > /etc/nginx/sites-available/nestledger << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/nestledger /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "=== Installing SSL certificate with Certbot ==="
echo "DNS must point $DOMAIN → $SERVER_IP before Certbot can issue a certificate."
echo ""
read -p "Is DNS already pointing to this server? (y/n): " DNS_READY

if [ "$DNS_READY" = "y" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || {
        echo ""
        echo "Certbot failed. You may need to run manually after DNS propagates:"
        echo "  certbot --nginx -d $DOMAIN"
    }
else
    echo ""
    echo "Skipping Certbot for now. After DNS is ready, run:"
    echo "  certbot --nginx -d $DOMAIN"
fi

echo ""
echo "=== Server setup complete! ==="
echo ""
echo "The systemd service is ENABLED but NOT STARTED (needs .env first)."
echo "To go live, trigger the GitHub Actions workflow:"
echo ""
echo "  1. Go to: https://github.com/Dinushan-S/NestLedger/actions/workflows/deploy-all.yml"
echo "  2. Click 'Run workflow' (workflow_dispatch)"
echo ""
echo "This will automatically:"
echo "  - Write the .env file from GitHub secrets"
echo "  - Install any new pip dependencies"
echo "  - Start (or restart) the nestledger service"
echo "  - Run a health check against https://$DOMAIN/api/health"
