#!/bin/bash

echo "🤖 Installing Node.js and Setting Up Deriv Bot..."
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if running on Ubuntu/Debian
if [ -f /etc/debian_version ]; then
    echo -e "${GREEN}✓ Debian/Ubuntu detected${NC}"
else
    echo -e "${YELLOW}⚠️  This script is optimized for Ubuntu/Debian${NC}"
fi

# Update system
echo -e "${YELLOW}Updating system...${NC}"
sudo apt update

# Install Node.js 18
echo -e "${YELLOW}Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
    echo -e "${GREEN}✓ npm $(npm -v) installed${NC}"
else
    echo -e "${RED}✗ Installation failed${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing bot dependencies...${NC}"
npm install

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env <<'EOF'
# Deriv API Credentials
DERIV_APP_ID=64037
DERIV_TOKEN=pfm6nudgLi4aNys

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
    echo -e "${GREEN}✓ .env file created${NC}"
fi

# Create directories
mkdir -p data logs

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Get your Deriv API credentials:"
echo "   https://app.deriv.com/account/api-token"
echo ""
echo "2. Edit the .env file:"
echo -e "   ${GREEN}nano .env${NC}"
echo "   Replace 'your_app_id_here' with your actual App ID"
echo "   Replace 'your_api_token_here' with your actual API Token"
echo ""
echo "3. Start the bot:"
echo -e "   ${GREEN}npm start${NC}"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  npm start          - Start bot normally"
echo "  npm run dev        - Start with auto-restart on changes"
echo "  npm run pm2:start  - Start with PM2 (production)"
echo ""