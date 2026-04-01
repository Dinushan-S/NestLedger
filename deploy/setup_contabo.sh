#!/bin/bash
# Initial setup script for Contabo server
# Run this once on your Contabo server

set -e

echo "=== Installing dependencies ==="
apt update
apt install -y python3.11 python3.11-venv python3-pip git nginx

echo "=== Cloning repository ==="
cd /opt
git clone https://github.com/Dinushan-S/NestLedger.git
cd NestLedger/backend

echo "=== Setting up Python environment ==="
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/nestledger.service << 'EOF'
[Unit]
Description=NestLedger FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/NestLedger/backend
Environment="PATH=/opt/NestLedger/backend/venv/bin"
ExecStart=/opt/NestLedger/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "=== Enabling and starting service ==="
systemctl daemon-reload
systemctl enable nestledger
systemctl start nestledger

echo "=== Setup complete! ==="
echo "Your API is running at: http://185.216.75.254:8000"
echo "Test with: curl http://185.216.75.254:8000/api/health"