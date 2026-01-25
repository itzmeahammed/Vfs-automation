# 🔧 Troubleshooting Service Failure

Your service is failing with exit code 1. Let's diagnose and fix it step by step.

## Step 1: Check if files exist

Run these commands on your server:

```bash
cd /home/ubuntu/vfs-automation

# Check if files exist
ls -la

# You should see:
# - dist/
# - package.json
# - node_modules/ (if installed)
# - vfs-bot.service
```

## Step 2: Check package.json scripts

```bash
cat package.json | grep -A 5 "scripts"

# Should show:
# "scripts": {
#   "loop": "node dist/loop-runner.js",
#   ...
# }
```

## Step 3: Install dependencies (if not done)

```bash
cd /home/ubuntu/vfs-automation

# Install npm packages
npm install

# This might take 2-3 minutes
```

## Step 4: Check if dist folder exists

```bash
ls -la dist/

# Should show:
# - loop-runner.js
# - config/
# - core/
# - flows/
# - utils/
```

## Step 5: Test run manually

```bash
cd /home/ubuntu/vfs-automation

# Try running directly
node dist/loop-runner.js

# Or with npm
npm run loop

# See what error appears
```

## Step 6: Check actual error logs

```bash
# View detailed logs with stderr
tail -100 /home/ubuntu/vfs-automation/logs/error.log

# Or check if log directory exists
ls -la logs/
```

## Step 7: Fix the service file

If logs directory doesn't exist:

```bash
cd /home/ubuntu/vfs-automation
mkdir -p logs
```

## Step 8: Common Fixes

### Fix 1: Missing dist folder

**On Windows:**
```powershell
npm run build
```

**Then upload `dist/` via WinSCP**

### Fix 2: Missing node_modules

**On server:**
```bash
cd /home/ubuntu/vfs-automation
npm install
```

### Fix 3: Wrong npm script

Check `package.json` has:
```json
"scripts": {
  "loop": "node dist/loop-runner.js"
}
```

## Step 9: Restart after fixing

```bash
sudo systemctl daemon-reload
sudo systemctl restart vfs-bot
sudo systemctl status vfs-bot
```

## Step 10: View live logs

```bash
# Real-time logs
sudo journalctl -u vfs-bot -f

# Last 200 lines with errors
sudo journalctl -u vfs-bot -n 200 --no-pager
```

---

## Quick Diagnostic Commands

Run these to get full picture:

```bash
cd /home/ubuntu/vfs-automation

# Check structure
ls -la

# Check if npm works
npm --version
node --version

# Check if dist exists
ls dist/

# Check if node_modules exists
ls node_modules/ | wc -l  # Should show many packages

# Try to run manually
npm run loop
```

The error will appear when you run manually, then we can fix it!
