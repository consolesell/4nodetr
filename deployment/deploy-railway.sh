#!/bin/bash

echo "🚀 Deploying to Railway.app..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "Logging in to Railway..."
railway login

# Initialize project
railway init

# Set environment variables
echo "Setting environment variables..."
echo "Enter your Deriv App ID:"
read APP_ID
railway variables set DERIV_APP_ID="$APP_ID"

echo "Enter your Deriv API Token:"
read -s TOKEN
railway variables set DERIV_TOKEN="$TOKEN"

railway variables set NODE_ENV="production"
railway variables set ENABLE_TRADING="true"
railway variables set LOG_LEVEL="info"

# Deploy
echo "Deploying to Railway..."
railway up

echo "✅ Deployment complete!"
echo "🌐 View your deployment: railway open"