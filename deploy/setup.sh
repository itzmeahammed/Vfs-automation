#!/bin/bash

# VFS Automation - Easy Deployment Script
# Usage: source setup.sh

echo "🚀 Starting VFS Automation Setup..."

# 1. Update System
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git unzip

# 2. Install Node.js (v20)
if ! command -v node &> /dev/null; then
    echo "🟢 Installing Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js is already installed"
fi

# 3. Install Global Tools (PM2)
echo "🛠️ Installing PM2..."
sudo npm install -g pm2 tsx

# 4. Install Project Dependencies
echo "📚 Installing project dependencies..."
if [ -f "package.json" ]; then
    npm install
else
    echo "❌ Error: package.json not found. Make sure you are in the project root."
    exit 1
fi

# 5. Install Playwright Browsers & System Dependencies
echo "🎭 Installing Playwright browsers and dependencies..."
npx playwright install chromium --with-deps

# 6. Setup Directory Structure
echo "📂 Creating necessary directories..."
mkdir -p browser-profiles
mkdir -p screenshots

echo "✅ Setup Complete!"
echo "---------------------------------------------------"
echo "To start the bot, run:"
echo "pm2 start ecosystem.config.cjs"
echo "---------------------------------------------------"
