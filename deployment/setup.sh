#!/bin/bash

echo "🤖 Deriv Trading Bot - Automated Setup"
echo "======================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Check Node.js version
echo -e "${YELLOW}Checking Node.js version...${NC}"
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 16 ]; then
    echo -e "${RED}Node.js 16+ is required. Please install it first.${NC}"
    echo "Visit: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create directories
echo -e "${YELLOW}Creating necessary directories...${NC}"
mkdir -p data logs deployment
echo -e "${GREEN}✓ Directories created${NC}"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env <<'EOF'
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
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${RED}⚠️  Please edit .env with your Deriv API credentials${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Create .gitignore
if [ ! -f .gitignore ]; then
    echo -e "${YELLOW}Creating .gitignore...${NC}"
    cat > .gitignore <<'EOF'
# Dependencies
node_modules/
package-lock.json

# Environment
.env
.env.local
.env.*.local

# Data & Logs
data/
logs/
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# PM2
.pm2/
EOF
    echo -e "${GREEN}✓ .gitignore created${NC}"
fi

# Create npm scripts helper
cat > package.json.tmp <<'EOF'
{
  "name": "deriv-cloud-bot",
  "version": "2.0.0",
  "description": "Autonomous Deriv trading bot with advanced ML",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dev": "nodemon bot.js",
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop deriv-bot",
    "pm2:restart": "pm2 restart deriv-bot",
    "pm2:logs": "pm2 logs deriv-bot",
    "pm2:status": "pm2 status deriv-bot",
    "pm2:monit": "pm2 monit deriv-bot",
    "docker:build": "docker build -t deriv-bot .",
    "docker:run": "docker-compose up -d",
    "docker:stop": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "test:connection": "node -e \"require('./bot.js')\"",
    "clean": "rm -rf data/*.json logs/*.log"
  },
  "keywords": ["deriv", "trading", "bot", "machine-learning"],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "ws": "^8.14.2",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "winston-daily-rotate-file": "^4.7.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
EOF

if [ ! -f package.json ]; then
    mv package.json.tmp package.json
    echo -e "${GREEN}✓ package.json created${NC}"
else
    rm package.json.tmp
fi

# Create PM2 ecosystem config
if [ ! -f ecosystem.config.js ]; then
    echo -e "${YELLOW}Creating PM2 ecosystem config...${NC}"
    cat > ecosystem.config.js <<'EOF'
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
    time: true,
    // Restart on crash
    min_uptime: '10s',
    max_restarts: 10,
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
EOF
    echo -e "${GREEN}✓ PM2 config created${NC}"
fi

# Create quick start scripts
echo -e "${YELLOW}Creating helper scripts...${NC}"

# start.sh
cat > start.sh <<'EOF'
#!/bin/bash
echo "🚀 Starting Deriv Trading Bot..."
npm start
EOF
chmod +x start.sh

# start-pm2.sh
cat > start-pm2.sh <<'EOF'
#!/bin/bash
echo "🚀 Starting Deriv Trading Bot with PM2..."
pm2 start ecosystem.config.js
pm2 save
echo "✅ Bot started. View logs: pm2 logs deriv-bot"
EOF
chmod +x start-pm2.sh

# stop-pm2.sh
cat > stop-pm2.sh <<'EOF'
#!/bin/bash
echo "🛑 Stopping Deriv Trading Bot..."
pm2 stop deriv-bot
pm2 save
echo "✅ Bot stopped"
EOF
chmod +x stop-pm2.sh

# logs.sh
cat > logs.sh <<'EOF'
#!/bin/bash
if pm2 list | grep -q "deriv-bot"; then
    pm2 logs deriv-bot --lines 100
else
    tail -f logs/*.log
fi
EOF
chmod +x logs.sh

echo -e "${GREEN}✓ Helper scripts created${NC}"

# Create README
if [ ! -f README.md ]; then
    echo -e "${YELLOW}Creating README.md...${NC}"
    cat > README.md <<'EOF'
# 🤖 Deriv Cloud Trading Bot

Advanced autonomous trading bot with machine learning capabilities for Deriv.com

## 🚀 Quick Start

### 1. Setup
```bash
chmod +x setup.sh
./setup.sh
```

### 2. Configure
Edit `.env` with your Deriv API credentials:
```bash
nano .env
```

### 3. Run

**Simple:**
```bash
npm start
```

**With PM2 (recommended for production):**
```bash
./start-pm2.sh
```

**With Docker:**
```bash
docker-compose up -d
```

## 📊 Monitoring

View logs:
```bash
./logs.sh
# or
pm2 logs deriv-bot
```

Check status:
```bash
pm2 status
```

## 🛠️ Management Commands
```bash
npm run pm2:start    # Start with PM2
npm run pm2:stop     # Stop bot
npm run pm2:restart  # Restart bot
npm run pm2:logs     # View logs
npm run pm2:status   # Check status
```

## ☁️ Cloud Deployment

### Render.com
```bash
cd deployment
./deploy-render.sh
```

### Railway.app
```bash
cd deployment
./deploy-railway.sh
```

### VPS (Ubuntu/Debian)
```bash
cd deployment
sudo ./deploy-vps.sh
```

### Docker
```bash
docker build -t deriv-bot .
docker run -d --name deriv-bot --env-file .env deriv-bot
```

## 📁 Project Structure
```
deriv-cloud-bot/
├── bot.js              # Main bot logic
├── config.json         # Configuration
├── .env                # Environment variables
├── utils/
│   ├── storage.js      # Persistence layer
│   ├── logger.js       # Logging system
│   └── config.js       # Config management
├── data/               # Learning data
├── logs/               # Log files
└── deployment/         # Deployment scripts
```

## 🧠 Features

- ✅ Advanced ML with 8 prediction models
- ✅ Bayesian probability fusion
- ✅ Context-aware memory system
- ✅ Meta-Q-learning for strategy adaptation
- ✅ Adaptive confidence thresholds
- ✅ Data integrity monitoring
- ✅ Automatic learning rate tuning
- ✅ Pattern recognition & storage
- ✅ Graceful error handling
- ✅ Persistent learning across restarts

## ⚙️ Configuration

Edit `config.json` for advanced settings:
- Learning parameters
- Trading limits
- Reconnection logic
- Logging preferences

## 🔒 Security

- Store API credentials in `.env` (never commit)
- Use environment variables in production
- Enable firewall on VPS deployments
- Regular log rotation configured

## 📈 Performance

The bot automatically:
- Tunes learning rates based on win rate
- Switches modes (precision/balanced/exploration)
- Adjusts confidence thresholds
- Monitors reasoning health
- Validates data integrity

## 🆘 Troubleshooting

**Connection issues:**
- Verify API credentials in `.env`
- Check network connectivity
- Review error logs: `tail -f logs/errors-*.log`

**Bot not trading:**
- Check `ENABLE_TRADING` in `.env`
- Verify sufficient balance
- Check confidence threshold settings

**High memory usage:**
- Reduce `limits.maxHistory` in `config.json`
- Clear old data: `npm run clean`

## 📄 License

MIT License - Use at your own risk

## ⚠️ Disclaimer

Trading involves risk. This bot is for educational purposes.
Test thoroughly before using real money.
EOF
    echo -e "${GREEN}✓ README.md created${NC}"
fi

# Final message
echo ""
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit your API credentials:"
echo -e "   ${GREEN}nano .env${NC}"
echo ""
echo "2. Start the bot:"
echo -e "   ${GREEN}npm start${NC}"
echo "   or with PM2:"
echo -e "   ${GREEN}./start-pm2.sh${NC}"
echo ""
echo "3. View logs:"
echo -e "   ${GREEN}./logs.sh${NC}"
echo ""
echo -e "${YELLOW}For cloud deployment:${NC}"
echo -e "   ${GREEN}cd deployment && ./deploy-vps.sh${NC} (VPS)"
echo -e "   ${GREEN}cd deployment && ./deploy-render.sh${NC} (Render)"
echo -e "   ${GREEN}cd deployment && ./deploy-railway.sh${NC} (Railway)"
echo ""
echo -e "${GREEN}Happy Trading! 🚀${NC}"