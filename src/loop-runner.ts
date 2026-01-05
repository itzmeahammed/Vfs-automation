/**
 * Loop Runner - Multi-Account Slot Checking System
 * 
 * This is the main entry point for the loop-based slot checking.
 * It rotates through accounts, checks slots, and sends notifications.
 * 
 * Usage: npm run loop
 */

import { Page } from 'playwright';
import { loopConfig, validateConfig, AccountCredentials } from './config/loop-config.js';
import { setTimingMode, delay } from './config/timing-config.js';
import { BrowserIdentityManager } from './core/browser-identity.js';
import { VFSLoginFlow } from './flows/vfs-login.js';
import { VFSBookingFlow } from './flows/vfs-booking.js';
import { sendSlotAlert, sendStatusUpdate, sendErrorAlert } from './utils/telegram.js';
import { rotateAWSPublicIP } from './utils/aws-ip-rotator.js';

// VFS URLs
const VFS_DASHBOARD_URL = 'https://visa.vfsglobal.com/are/en/mlt/dashboard';
const VFS_LOGIN_URL = 'https://visa.vfsglobal.com/are/en/ita/login';

/**
 * Main Loop Runner Class
 */
class LoopRunner {
    private identity: BrowserIdentityManager | null = null;
    private page: Page | null = null;
    private cycleCount: number = 0;

    async run(): Promise<void> {
        console.log('\n' + '═'.repeat(60));
        console.log('🔄 VFS MULTI-ACCOUNT SLOT CHECKER');
        console.log('═'.repeat(60));
        console.log(`   Mode: ${loopConfig.mode.toUpperCase()}`);
        console.log(`   Accounts: ${loopConfig.accounts.length}`);
        console.log(`   Visa Types: ${loopConfig.visaTypes?.length || 1} types to check per login`);
        console.log(`   Interval: ${loopConfig.intervalMinutes} minutes`);
        console.log(`   Telegram: ${loopConfig.telegram.enabled ? 'Enabled' : 'Disabled'}`);
        console.log('═'.repeat(60) + '\n');

        // Validate config
        if (!validateConfig()) {
            console.error('❌ Invalid configuration. Please check loop-config.ts');
            return;
        }

        // Set timing mode - FAST for quick slot checks
        setTimingMode('fast');

        // Send startup notification
        await sendStatusUpdate(`🚀 Bot started!\n\n📧 Accounts: ${loopConfig.accounts.length}\n🔁 Mode: ${loopConfig.mode}\n⏱️ Interval: ${loopConfig.intervalMinutes} min`);

        // Main infinite loop
        while (true) {
            // Strict Scheduling: Wait BEFORE the cycle if enabled
            if (loopConfig.schedule?.enabled) {
                // If account mapping is enabled, wait for next scheduled account
                if (loopConfig.schedule.accountMapping?.enabled) {
                    const { accountIndex, minute } = await this.waitForNextScheduledAccount();

                    this.cycleCount++;
                    console.log('\n' + '═'.repeat(60));
                    console.log(`🔄 CYCLE ${this.cycleCount} - Account ${accountIndex + 1} at :${minute.toString().padStart(2, '0')}`);
                    console.log('═'.repeat(60));

                    // Process only the scheduled account
                    const account = loopConfig.accounts[accountIndex];
                    console.log(`\n📧 Account ${accountIndex + 1}/${loopConfig.accounts.length}: ${account.email}`);

                    try {
                        await this.processAccount(account, accountIndex);
                    } catch (error) {
                        console.log(`❌ Error with account ${account.email}:`, error);
                        await sendErrorAlert(String(error), account.email);
                    }

                    // Close browser after account
                    await this.closeBrowser();
                    continue; // Skip the normal account loop
                }

                // Normal schedule mode - all accounts run at same time
                await this.waitForNextSchedule();
            }

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

            console.log('\n' + '═'.repeat(60));
            console.log(`✅ CYCLE ${this.cycleCount} COMPLETE`);
            console.log('═'.repeat(60));

            // Standard Interval: Wait AFTER the cycle if scheduling is DISABLED
            if (!loopConfig.schedule?.enabled) {
                console.log(`⏳ Waiting ${loopConfig.intervalMinutes} minutes before next cycle...`);
                await this.sleep(loopConfig.intervalMinutes * 60 * 1000);
            }
        }
    }

    /**
     * Calculate and wait for the next scheduled time slot
     */
    private async waitForNextSchedule(): Promise<void> {
        const minutes = loopConfig.schedule?.minutes || [];
        if (minutes.length === 0) {
            console.log('⚠️ Schedule enabled but no minutes configured. Running immediately.');
            return;
        }

        const now = new Date();
        const candidates: Date[] = [];

        // Generate candidate run times for current and next hour
        for (const m of minutes) {
            // Candidate in current hour
            const c1 = new Date(now);
            c1.setMinutes(m, 0, 0);
            if (c1.getTime() > now.getTime()) candidates.push(c1);

            // Candidate in next hour
            const c2 = new Date(now);
            c2.setHours(c2.getHours() + 1);
            c2.setMinutes(m, 0, 0);
            candidates.push(c2);
        }

        // Find the earliest future time
        candidates.sort((a, b) => a.getTime() - b.getTime());
        const nextRun = candidates[0];

        if (nextRun) {
            const waitMs = nextRun.getTime() - now.getTime();
            const waitMinutes = (waitMs / 60000).toFixed(1);
            console.log('\n' + '═'.repeat(60));
            console.log(`📅 STRICT SCHEDULE ENGAGED`);
            console.log(`   Next Run: ${nextRun.toLocaleTimeString()}`);
            console.log(`   Waiting:  ${waitMinutes} minutes`);
            console.log('═'.repeat(60));

            await this.sleep(waitMs);
        }
    }

    /**
     * Calculate and wait for the next scheduled account (account mapping mode)
     * Returns the account index and minute to run
     */
    private async waitForNextScheduledAccount(): Promise<{ accountIndex: number; minute: number }> {
        const mapping = loopConfig.schedule?.accountMapping?.mapping || [];
        if (mapping.length === 0) {
            console.log('⚠️ Account mapping enabled but no mapping configured. Using account 0.');
            return { accountIndex: 0, minute: 0 };
        }

        const now = new Date();
        const candidates: Array<{ time: Date; accountIndex: number; minute: number }> = [];

        // Generate candidate run times for each account
        for (let accIndex = 0; accIndex < loopConfig.accounts.length; accIndex++) {
            const assignedMinute = mapping[accIndex];
            if (assignedMinute === undefined) continue;

            // Candidate in current hour
            const c1 = new Date(now);
            c1.setMinutes(assignedMinute, 0, 0);
            if (c1.getTime() > now.getTime()) {
                candidates.push({ time: c1, accountIndex: accIndex, minute: assignedMinute });
            }

            // Candidate in next hour
            const c2 = new Date(now);
            c2.setHours(c2.getHours() + 1);
            c2.setMinutes(assignedMinute, 0, 0);
            candidates.push({ time: c2, accountIndex: accIndex, minute: assignedMinute });
        }

        // Find the earliest future time
        candidates.sort((a, b) => a.time.getTime() - b.time.getTime());
        const nextRun = candidates[0];

        if (nextRun) {
            const waitMs = nextRun.time.getTime() - now.getTime();
            const waitMinutes = (waitMs / 60000).toFixed(1);
            const account = loopConfig.accounts[nextRun.accountIndex];

            console.log('\n' + '═'.repeat(60));
            console.log(`📅 ACCOUNT-SPECIFIC SCHEDULE`);
            console.log(`   Account ${nextRun.accountIndex + 1}: ${account.email}`);
            console.log(`   Next Run: ${nextRun.time.toLocaleTimeString()} (:${nextRun.minute.toString().padStart(2, '0')})`);
            console.log(`   Waiting:  ${waitMinutes} minutes`);
            console.log('═'.repeat(60));

            await this.sleep(waitMs);
            return { accountIndex: nextRun.accountIndex, minute: nextRun.minute };
        }

        // Fallback
        return { accountIndex: 0, minute: 0 };
    }

    /**
     * Process a single account - login, check slots N times, logout
     */
    private async processAccount(account: AccountCredentials, accountIndex: number): Promise<void> {
        // Launch browser with stealth
        await this.launchBrowser(account.email);
        if (!this.page) throw new Error('Page not initialized');

        // Login
        console.log('\n🔐 Logging in...');
        const loginFlow = new VFSLoginFlow(this.page, {
            loginUrl: VFS_LOGIN_URL,
            screenshotOnError: true,
        });

        // Determine Gmail config for this account
        // Use account-specific gmailAppPassword if set, otherwise fall back to global config
        const gmailConfig = loopConfig.gmail.enabled ? {
            user: account.email,  // Use account's own email for OTP
            password: account.gmailAppPassword || loopConfig.gmail.appPassword  // Account-specific or global
        } : undefined;

        const loginResult = await loginFlow.execute({
            email: account.email,
            password: account.password,
            gmailConfig: gmailConfig
        });

        if (!loginResult.success) {
            console.log(`❌ Login failed: ${loginResult.message}`);
            await sendErrorAlert(`Login failed: ${loginResult.message}`, account.email);
            return;
        }
        console.log('✅ Login successful');
        await sendStatusUpdate(`✅ Logged in: ${account.email}`);

        // Determine visa types to check
        const visaTypes = loopConfig.visaTypes && loopConfig.visaTypes.length > 0
            ? loopConfig.visaTypes
            : [{
                name: 'Tourist',
                centre: 'dubai',
                category: 'Short Stay',
                subCategory: loopConfig.subCategory
            }];

        console.log(`\n📋 Will check ${visaTypes.length} visa type(s):`);
        visaTypes.forEach((vt, idx) => {
            console.log(`   ${idx + 1}. ${vt.centre.toUpperCase()}, ${vt.name} (${vt.category})`);
        });

        // Check each visa type
        for (let visaTypeIndex = 0; visaTypeIndex < visaTypes.length; visaTypeIndex++) {
            const visaType = visaTypes[visaTypeIndex];
            const visaLabel = `${visaType.centre.charAt(0).toUpperCase() + visaType.centre.slice(1)}, ${visaType.name}`;

            console.log(`\n${'═'.repeat(60)}`);
            console.log(`🎯 Checking: ${visaLabel}`);
            console.log(`${'═'.repeat(60)}`);

            try {
                const slotResult = await this.checkEarliestSlot(visaType);

                if (slotResult.found) {
                    console.log(`🎯 SLOT FOUND for ${visaLabel}: ${slotResult.date}`);
                    await sendSlotAlert(
                        slotResult.date || 'Unknown date',
                        account.email,
                        visaLabel
                    );

                    // If full_scenario mode, continue booking
                    if (loopConfig.mode === 'full_scenario') {
                        console.log('📋 Full scenario mode - continuing booking...');
                        // TODO: Continue with full booking flow
                    }
                } else if (slotResult.error) {
                    console.log(`   ⚠️ Failed for ${visaLabel}: ${slotResult.error}`);
                    await sendStatusUpdate(`⚠️ Failed: ${slotResult.error}\n📍 ${visaLabel}\n📧 ${account.email}`);
                } else {
                    console.log(`   ❌ No slot for ${visaLabel}`);
                    await sendStatusUpdate(`❌ No slot for ${visaLabel}\n📧 ${account.email}`);
                }

                // Go back to dashboard for next visa type (if not last)
                if (visaTypeIndex < visaTypes.length - 1) {
                    await this.goBackToDashboard();
                    await delay(500);  // Faster!
                }
            } catch (error) {
                console.log(`   ❌ Error checking ${visaLabel}: ${error}`);
            }
        }

        // Logout
        console.log('\n🚪 Logging out...');
        await this.logout();

        // Rotate IP if enabled
        if (loopConfig.rotateIP) {
            await rotateAWSPublicIP();
            // Wait for network to stabilize
            await this.sleep(5000);
        }
    }

    /**
     * Check earliest slot - goes through booking flow until slot detection
     */
    private async checkEarliestSlot(visaType: any): Promise<{ found: boolean; date?: string; error?: string }> {
        if (!this.page) return { found: false, error: 'No page available' };

        // Map visa type to application centre
        const APPLICATION_CENTRES: Record<string, string> = {
            dubai: 'Italy Visa application center- Dubai',
            abudhabi: 'Italy Visa application center- Abu Dhabi',
        };

        // Pass the mode and visa type info to booking flow
        const bookingFlow = new VFSBookingFlow(this.page, {
            mode: loopConfig.mode,
            subCategory: visaType.subCategory,
            applicationCentre: APPLICATION_CENTRES[visaType.centre],
            visaType: {
                name: visaType.name,
                centre: visaType.centre,
                category: visaType.category,
            },
        });

        const result = await bookingFlow.execute();

        if (result.success && result.earliestSlot) {
            return { found: true, date: result.earliestSlot };
        }

        // Distinguish between error and no slot
        if (!result.success) {
            return { found: false, error: result.message };
        }

        return { found: false };  // Success but no slot
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
     * Launch browser using BrowserIdentityManager (same as npm run dev)
     */
    private async launchBrowser(accountEmail: string): Promise<void> {
        // Create profile ID from email
        const profileId = `vfs-loop-${accountEmail.split('@')[0]}`;

        this.identity = new BrowserIdentityManager({
            profileId: profileId,
            headless: loopConfig.headless,
            persistSession: true,
            profilesDir: './browser-profiles',
        });

        const { page } = await this.identity.launch();
        this.page = page;
    }

    /**
     * Close browser completely and wait for cleanup
     */
    private async closeBrowser(): Promise<void> {
        try {
            if (this.identity) {
                console.log('   🔄 Closing browser...');
                await this.identity.close();
                this.identity = null;
                console.log('   ✅ Browser closed');
            }
        } catch (error) {
            console.log('   ⚠️ Browser close error:', error);
        }
        this.page = null;
        // Wait for browser process to fully terminate
        await this.sleep(2000);
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

