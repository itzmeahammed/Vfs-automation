# 💻 Run Locally (Hidden Bundle)

Since AWS IPs are getting blocked by Cloudflare, the **safest** place to run this bot is right here on your laptop. Your home internet (Residential IP) is much "cleaner" and won't get blocked.

## How to Run it 24/7 (Hidden)
You don't need to keep a black terminal window open. I made a "Ghost Script" for you.

### 1. START the Bot
1.  Go to the `deploy` folder.
2.  Double-click **`run-silent.vbs`**.
3.  **Nothing will happen**. (That's the point! It started in the background).

### 2. CHECK if it's running
1.  Open **Task Manager** (`Ctrl + Shift + Esc`).
2.  Look for `Node.js JavaScript Runtime`.
3.  If you see it, the bot is working!

### 3. STOP the Bot
1.  Go to the `deploy` folder.
2.  Double-click **`stop.bat`**.
3.  This will kill all hidden bot processes.

## ⚠️ Important Rules
1.  **Do not sleep**: Your laptop must stay **ON**.
    *   *Settings -> System -> Power & sleep -> Screen: "Never", Sleep: "Never".*
2.  **Notification**: You will get Telegram messages as usual.
