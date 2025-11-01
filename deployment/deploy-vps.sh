#!/bin/bash

echo "🖥️  VPS Deployment Script for Deriv Trading Bot"
echo "================================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
apt update && apt upgrade -y

# Install Node.js 18
echo -e "${YELLOW}Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2 globally
echo -e "${YELLOW}Installing PM2 process manager...${NC}"
npm install -g pm2

# Install Git
echo -e "${YELLOW}Installing Git...${NC}"
apt install -y git

# Create bot user
echo -e "${YELLOW}Creating bot user...${NC}"
if ! id -u botuser > /dev/null 2>&1; then
    useradd -m -s /bin/bash botuser
    echo -e "${GREEN}User 'botuser' created${NC}"
fi

# Setup bot directory
BOT_DIR="/home/botuser/deriv-bot"
echo -e "${YELLOW}Setting up bot directory at $BOT_DIR...${NC}"

# Clone or copy bot files
if [ -d "$BOT_DIR" ]; then
    echo -e "${YELLOW}Bot directory exists. Updating...${NC}"
    cd $BOT_DIR
    git pull 2>/dev/null || echo "Not a git repository"
else
    mkdir -p $BOT_DIR
fi

# Copy files (assuming script is run from project root)
cp -r ../bot.js $BOT_DIR/
cp -r ../utils $BOT_DIR/
cp -r ../package.json $BOT_DIR/
cp -r ../config.json $BOT_DIR/

# Create directories
mkdir -p $BOT_DIR/data $BOT_DIR/logs

# Set permissions
chown -R botuser:botuser $BOT_DIR

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
cd $BOT_DIR
sudo -u botuser npm install

# Setup environment file
echo -e "${YELLOW}Setting up environment variables...${NC}"
if [ ! -f "$BOT_DIR/.env" ]; then
    cat > $BOT_DIR/.env <<EOF
# Deriv API Credentials
DERIV_APP_ID=your_app_id_here
DERIV_TOKEN=your_api_token_here

# Trading Configuration
SYMBOL=R_10
BASE_STAKE=1
DURATION=1

# Bot Settings
ENABLE_TRADING=true
LOG_LEVEL=info
MAX_CONSECUTIVE_LOSSES=5
COOLDOWN_MS=5000

# Advanced Settings
BASE_LEARNING_RATE=0.15
BASE_CONFIDENCE_THRESHOLD=0.57
EPSILON=0.0
EOF
    chown botuser:botuser $BOT_DIR/.env
    echo -e "${RED}⚠️  Please edit $BOT_DIR/.env with your API credentials${NC}"
    echo -e "${YELLOW}Run: nano $BOT_DIR/.env${NC}"
fi

# Create PM2 ecosystem file
cat > $BOT_DIR/ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'deriv-bot',
    script: './bot.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
EOF

chown botuser:botuser $BOT_DIR/ecosystem.config.js

# Setup PM2 startup script
echo -e "${YELLOW}Configuring PM2 startup...${NC}"
sudo -u botuser pm2 startup systemd -u botuser --hp /home/botuser
env PATH=$PATH:/usr/bin pm2 startup systemd -u botuser --hp /home/botuser

# Setup logrotate
echo -e "${YELLOW}Setting up log rotation...${NC}"
cat > /etc/logrotate.d/deriv-bot <<EOF
$BOT_DIR/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
    create 0640 botuser botuser
    sharedscripts
    postrotate
        sudo -u botuser pm2 reloadLogs
    endscript
}
EOF

# Setup UFW firewall (optional)
echo -e "${YELLOW}Would you like to setup UFW firewall? (y/n)${NC}"
read -r setup_firewall
if [ "$setup_firewall" = "y" ]; then
    apt install -y ufw
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw --force enable
    echo -e "${GREEN}Firewall configured${NC}"
fi

# Create management scripts
echo -e "${YELLOW}Creating management scripts...${NC}"

# Start script
cat > $BOT_DIR/start.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
pm2 start ecosystem.config.js
pm2 save
echo "Bot started. View logs: pm2 logs deriv-bot"
EOF

# Stop script
cat > $BOT_DIR/stop.sh <<'EOF'
#!/bin/bash
pm2 stop deriv-bot
echo "Bot stopped"
EOF

# Restart script
cat > $BOT_DIR/restart.sh <<'EOF'
#!/bin/bash
pm2 restart deriv-bot
echo "Bot restarted"
EOF

# Status script
cat > $BOT_DIR/status.sh <<'EOF'
#!/bin/bash
pm2 status deriv-bot
pm2 logs deriv-bot --lines 50 --nostream
EOF

# Update script
cat > $BOT_DIR/update.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
pm2 stop deriv-bot
git pull 2>/dev/null || echo "Not a git repository"
npm install
pm2 restart deriv-bot
echo "Bot updated and restarted"
EOF

# Make scripts executable
chmod +x $BOT_DIR/*.sh
chown botuser:botuser $BOT_DIR/*.sh

# Print completion message
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ VPS Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit environment file:"
echo -e "   ${GREEN}sudo nano $BOT_DIR/.env${NC}"
echo ""
echo "2. Start the bot:"
echo -e "   ${GREEN}cd $BOT_DIR && sudo -u botuser ./start.sh${NC}"
echo ""
echo "3. View bot status:"
echo -e "   ${GREEN}cd $BOT_DIR && sudo -u botuser ./status.sh${NC}"
echo ""
echo "4. View live logs:"
echo -e "   ${GREEN}sudo -u botuser pm2 logs deriv-bot${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  Start:   cd $BOT_DIR && sudo -u botuser ./start.sh"
echo "  Stop:    cd $BOT_DIR && sudo -u botuser ./stop.sh"
echo "  Restart: cd $BOT_DIR && sudo -u botuser ./restart.sh"
echo "  Status:  cd $BOT_DIR && sudo -u botuser ./status.sh"
echo "  Update:  cd $BOT_DIR && sudo -u botuser ./update.sh"
echo ""
echo -e "${GREEN}Bot will auto-start on system reboot${NC}"