#!/bin/bash
# =============================================================
#  Setup script cho server mới — chatbox.dungbeo.id.vn
#  Chạy với: bash setup-server.sh
# =============================================================
set -e

DOMAIN="chatbox.dungbeo.id.vn"
EMAIL="admin@dungbeo.id.vn"   # <-- đổi thành email thật để nhận cảnh báo SSL
APP_DIR="/opt/chatbot"

echo "========================================"
echo "  Deploy: $DOMAIN"
echo "========================================"

# ── 1. Cập nhật hệ thống ──────────────────────────────────────
echo ""
echo "[1/6] Cập nhật hệ thống..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx

# ── 2. Cài Docker ────────────────────────────────────────────
echo ""
echo "[2/6] Cài Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker đã cài xong"
else
  echo "✅ Docker đã có sẵn"
fi

# Cài Docker Compose plugin (v2)
if ! docker compose version &> /dev/null; then
  apt-get install -y docker-compose-plugin
  echo "✅ Docker Compose đã cài xong"
else
  echo "✅ Docker Compose đã có sẵn"
fi

# ── 3. Firewall ───────────────────────────────────────────────
echo ""
echo "[3/6] Cấu hình firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "✅ Firewall OK"

# ── 4. Copy code vào server ───────────────────────────────────
echo ""
echo "[4/6] Chuẩn bị thư mục app: $APP_DIR"
mkdir -p "$APP_DIR"

echo ""
echo ">>> Code đã được copy vào $APP_DIR chưa?"
echo "    Nếu chưa, mở terminal mới trên máy local và chạy:"
echo ""
echo "    rsync -avz --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \\"
echo "      /path/to/chatbot/ root@SERVER_IP:$APP_DIR/"
echo ""
read -p "    Nhấn Enter khi code đã sẵn sàng trong $APP_DIR..."

# Kiểm tra file .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  Chưa có file .env trong $APP_DIR"
  echo "    Copy từ ví dụ:"
  echo "    cp $APP_DIR/.env.example $APP_DIR/.env"
  echo "    nano $APP_DIR/.env"
  echo ""
  read -p "    Nhấn Enter khi đã tạo xong .env..."
fi

# ── 5. SSL với Let's Encrypt ──────────────────────────────────
echo ""
echo "[5/6] Cấp SSL cho $DOMAIN..."

# Nginx config tạm để certbot verify
cat > /etc/nginx/sites-available/chatbot <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF

ln -sf /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/chatbot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Lấy cert
certbot certonly --webroot -w /var/www/html \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "✅ SSL cert OK"

# ── 6. Nginx config production (SSL + proxy) ─────────────────
echo ""
echo "[6/6] Cấu hình Nginx production..."

cat > /etc/nginx/sites-available/chatbot <<'NGINXEOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=socket_limit:10m rate=20r/s;

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name chatbox.dungbeo.id.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name chatbox.dungbeo.id.vn;

    ssl_certificate     /etc/letsencrypt/live/chatbox.dungbeo.id.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chatbox.dungbeo.id.vn/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Bảo mật headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # Block chatbot endpoints từ bên ngoài
    location ~ ^/chatbot/(ask|train|train-url|chunks) {
        return 403;
    }

    location /chatbot/ {
        limit_req zone=api_limit burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8080/chatbot/;
        proxy_set_header Host $host;
    }

    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /webhook/ {
        limit_req zone=webhook_limit burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        limit_req zone=socket_limit burst=50 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINXEOF

nginx -t && systemctl reload nginx
echo "✅ Nginx config OK"

# ── Auto-renew SSL ────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
echo "✅ Auto-renew SSL đã setup"

# ── Start Docker ─────────────────────────────────────────────
echo ""
echo "▶  Khởi động Docker Compose..."
cd "$APP_DIR"
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

echo ""
echo "========================================"
echo "  DEPLOY XONG!"
echo "  🌐 https://$DOMAIN"
echo "========================================"
echo ""
echo "Xem log: docker compose -f $APP_DIR/docker-compose.yml logs -f"
