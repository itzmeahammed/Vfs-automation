/**
 * Loop Runner - Multi-Account Slot Checking System
 * 
 * This is the main entry point for the loop-based slot checking.
 * It rotates through accounts, checks slots, and sends notifications.
 * 
 * Usage: npm run loop
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { loopConfig, validateConfig, AccountCredentials } from './config/loop-config.js';
import { setTimingMode, delay } from './config/timing-config.js';
import { VFSLoginFlow } from './flows/vfs-login.js';
import { VFSBookingFlow } from './flows/vfs-booking.js';
import { sendSlotAlert, sendStatusUpdate, sendErrorAlert } from './utils/telegram.js';

// VFS URLs
const VFS_DASHBOARD_URL = 'https://visa.vfsglobal.com/are/en/mlt/dashboard';
const VFS_LOGIN_URL = 'https://visa.vfsglobal.com/are/en/mlt/login';

/**
 * Main Loop Runner Class
 */
class LoopRunner {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private cycleCount: number = 0;

    async run(): Promise<void> {
        console.log('\n' + '═'.repeat(60));
        console.log('🔄 VFS MULTI-ACCOUNT SLOT CHECKER');
        console.log('═'.repeat(60));
        console.log(`   Mode: ${loopConfig.mode.toUpperCase()}`);
        console.log(`   Accounts: ${loopConfig.accounts.length}`);
        console.log(`   Slots per login: ${loopConfig.slotsPerLogin}`);
        console.log(`   Interval: ${loopConfig.intervalMinutes} minutes`);
        console.log(`   Telegram: ${loopConfig.telegram.enabled ? 'Enabled' : 'Disabled'}`);
        console.log('═'.repeat(60) + '\n');

        // Validate config
        if (!validateConfig()) {
            console.error('❌ Invalid configuration. Please check loop-config.ts');
            return;
        }

        // Set timing mode
        setTimingMode('balanced');

        // Send startup notification
        await sendStatusUpdate(`🚀 Bot started!\n\n📧 Accounts: ${loopConfig.accounts.length}\n🔁 Mode: ${loopConfig.mode}\n⏱️ Interval: ${loopConfig.intervalMinutes} min`);

        // Main infinite loop
        while (true) {
            this.cycleCount++;
            console.log('\n' + '═'.repeat(60));
            console.log(`🔄 CYCLE ${this.cycleCount} STARTING`);
            console.log('═'.repeat(60));

            // Process each account
            for (let accIndex = 0; accIndex < loopConfig.accounts.length; accIndex++) {
                const account = loopConfig.accounts[accIndex];
                console.log(`\n📧 Account ${accIndex + 1}/${loopConfig.accounts.length}: ${account.email}`);

                try {
                    await this.processAccount(account, accIndex);
                } catch (error) {
                    console.log(`❌ Error with account ${account.email}:`, error);
                    await sendErrorAlert(String(error), account.email);
                }

                // Close browser after each account
                await this.closeBrowser();

                // Small delay between accounts
                if (accIndex < loopConfig.accounts.length - 1) {
                    console.log('\n⏳ Waiting 30 seconds before next account...');
                    await this.sleep(30000);
                }
            }

            // Wait for interval before next cycle
            console.log('\n' + '═'.repeat(60));
            console.log(`⏳ CYCLE ${this.cycleCount} COMPLETE`);
            console.log(`   Waiting ${loopConfig.intervalMinutes} minutes before next cycle...`);
            console.log('═'.repeat(60));

            await this.sleep(loopConfig.intervalMinutes * 60 * 1000);
        }
    }

    /**
     * Process a single account - login, check slots N times, logout
     */
    private async processAccount(account: AccountCredentials, accountIndex: number): Promise<void> {
        // Launch browser
        await this.launchBrowser();
        if (!this.page) throw new Error('Page not initialized');

        // Login
        console.log('\n🔐 Logging in...');
        const loginFlow = new VFSLoginFlow(this.page);
        const loginResult = await loginFlow.execute({
            email: account.email,
            password: account.password,
        });

        if (!loginResult.success) {
            console.log(`❌ Login failed: ${loginResult.message}`);
            await sendErrorAlert(`Login failed: ${loginResult.message}`, account.email);
            return;
        }
        console.log('✅ Login successful');

        // Check slots N times
        for (let slotCheck = 1; slotCheck <= loopConfig.slotsPerLogin; slotCheck++) {
            console.log(`\n🔍 Slot check ${slotCheck}/${loopConfig.slotsPerLogin}...`);

            try {
                const slotResult = await this.checkEarliestSlot();

                if (slotResult.found) {
                    console.log(`🎯 SLOT FOUND: ${slotResult.date}`);
                    await sendSlotAlert(slotResult.date || 'Unknown date', account.email);

                    // If full_scenario mode, continue booking
                    if (loopConfig.mode === 'full_scenario') {
                        console.log('📋 Full scenario mode - continuing booking...');
                        // TODO: Continue with full booking flow
                    }
                } else {
                    console.log('   ❌ No slot found');
                }

                // Go back to dashboard for next check (if not last)
                if (slotCheck < loopConfig.slotsPerLogin) {
                    await this.goBackToDashboard();
                    await delay(3000);
                }
            } catch (error) {
                console.log(`   ❌ Error checking slot: ${error}`);
            }
        }

        // Logout
        console.log('\n🚪 Logging out...');
        await this.logout();
    }

    /**
     * Check earliest slot - goes through booking flow until slot detection
     */
    private async checkEarliestSlot(): Promise<{ found: boolean; date?: string }> {
        if (!this.page) return { found: false };

        const bookingFlow = new VFSBookingFlow(this.page);
        const result = await bookingFlow.execute();

        if (result.success && result.earliestSlot) {
            return { found: true, date: result.earliestSlot };
        }

        return { found: false };
    }

    /**
     * Go back to dashboard (for next slot check)
     */
    private async goBackToDashboard(): Promise<void> {
        if (!this.page) return;

        console.log('   ↩️ Going back to dashboard...');
        await this.page.goto(VFS_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
        await delay(3000);
    }

    /**
     * Logout from VFS
     */
    private async logout(): Promise<void> {
        if (!this.page) return;

        try {
            // Click My Account dropdown
            const accountMenu = this.page.locator('text=My Account, button:has-text("My Account")').first();
            if (await accountMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
                await accountMenu.click();
                await delay(1000);
            }

            // Click Logout
            const logoutBtn = this.page.locator('text=Logout, text=Sign Out, button:has-text("Logout")').first();
            if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await logoutBtn.click();
                await delay(2000);
            }

            console.log('✅ Logged out');
        } catch (error) {
            console.log('⚠️ Logout may have failed:', error);
            // Navigate to login page as fallback
            await this.page.goto(VFS_LOGIN_URL, { waitUntil: 'domcontentloaded' });
        }
    }

    /**
     * Launch browser
     */
    private async launchBrowser(): Promise<void> {
        this.browser = await chromium.launch({
            headless: loopConfig.headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ],
        });

        this.context = await this.browser.newContext({
            viewport: { width: 1366, height: 768 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        // Anti-detection
        await this.context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        this.page = await this.context.newPage();
    }

    /**
     * Close browser
     */
    private async closeBrowser(): Promise<void> {
        if (this.page) await this.page.close().catch(() => { });
        if (this.context) await this.context.close().catch(() => { });
        if (this.browser) await this.browser.close().catch(() => { });
        this.page = null;
        this.context = null;
        this.browser = null;
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main entry point
const runner = new LoopRunner();
runner.run().catch(console.error);
