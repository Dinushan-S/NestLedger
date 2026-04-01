#!/bin/bash
# Create .env file on Contabo server
# Run this after setup_contabo.sh

echo "=== Creating environment file ==="
cat > /opt/NestLedger/backend/.env << 'EOF'
SUPABASE_URL=https://yrrshpkaqvphkdayzodh.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycnNocGthcXZwaGtkYXl6b2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4ODM3MDUsImV4cCI6MjA4ODQ1OTcwNX0.2WfUt3FdYBoW288-1PBNBtbecmRs0kJG7cc9I-W07CU
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
APP_PUBLIC_URL=http://185.216.75.254:8000
BREVO_FROM_EMAIL=your-email@example.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_LOGIN=your-brevo-login
SMTP_PASSWORD=your-brevo-password
EOF

echo "=== Restarting service with new env ==="
systemctl restart nestledger
systemctl status nestledger --no-pager

echo "IMPORTANT: Edit .env file with your real secrets:"
echo "nano /opt/NestLedger/backend/.env"