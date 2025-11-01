#!/bin/bash

echo "🚀 Deploying to Render.com..."

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "Installing Render CLI..."
    npm install -g render-cli
fi

# Login to Render
echo "Please ensure you're logged in to Render CLI"
render login

# Create render.yaml if it doesn't exist
cat > render.yaml <<EOF
services:
  - type: web
    name: deriv-trading-bot
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DERIV_APP_ID
        sync: false
      - key: DERIV_TOKEN
        sync: false
      - key: ENABLE_TRADING
        value: true
      - key: LOG_LEVEL
        value: info
    autoDeploy: true
    healthCheckPath: /health
EOF

echo "✅ render.yaml created"
echo "📝 Please set your DERIV_APP_ID and DERIV_TOKEN in Render dashboard"
echo "🌐 Deploy at: https://dashboard.render.com"