/**
 * Mailnesia OTP Fetcher - WITH AD BLOCKER SUPPORT
 * 
 * Uses uBlock Origin Lite extension to block redirects/ads
 */

import { chromium, Browser } from 'playwright';

export interface MailnesiaConfig {
    email: string;
    password?: string;
}

function getMailboxName(email: string): string {
    return email.split('@')[0];
}

export async function fetchOTPFromMailnesia(
    config: MailnesiaConfig,
    maxAgeMinutes: number = 5
): Promise<string | null> {
    console.log('📧 Fetching OTP from Mailnesia...');

    let browser: Browser | null = null;

    try {
        const mailboxName = getMailboxName(config.email);
        const mailboxUrl = `https://mailnesia.com/mailbox/${mailboxName}`;

        console.log(`   🌐 Opening mailbox: ${mailboxUrl}`);

        // Get extension path from environment or use default
        const extensionPath = process.env.UBLOCK_EXTENSION_PATH || '';

        const launchOptions: any = {
            headless: false,  // Extensions require headed mode
            slowMo: 100,
        };

        // Load uBlock Origin Lite extension to block ads/redirects
        if (extensionPath && extensionPath.length > 0) {
            console.log(`   🛡️ Loading ad-blocker extension...`);
            launchOptions.args = [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--no-sandbox',
            ];
        } else {
            console.log('   ⚠️ No ad-blocker extension configured');
            console.log('   💡 Set UBLOCK_EXTENSION_PATH to block redirects');
        }

        browser = await chromium.launch(launchOptions);

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        const page = await context.newPage();

        await page.goto(mailboxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('   ✅ Mailbox loaded');

        // Wait for emails to load
        await page.waitForTimeout(4000);

        console.log('   🔍 Looking for emails...');

        // Use correct selector: tr.emailheader
        const emailRows = await page.locator('tr.emailheader').all();
        console.log(`   📬 Found ${emailRows.length} email(s)`);

        if (emailRows.length === 0) {
            console.log('   ⚠️ No emails found in mailbox');
            return null;
        }

        // Click the FIRST email (most recent)
        const firstEmail = emailRows[0];
        const emailText = await firstEmail.textContent() || '';
        console.log(`   📨 First email: ${emailText.substring(0, 70)}...`);
        console.log('   🖱️  Clicking first email...');

        await firstEmail.click();
        await page.waitForTimeout(3000);

        // Extract OTP from the opened email page
        console.log('   📄 Email opened, extracting OTP...');
        const pageText = await page.textContent('body') || '';

        // Try multiple OTP patterns
        let otpMatch = pageText.match(/(?:VFS Global is|is|:)\s*(\d{6})/i);

        if (!otpMatch) {
            // Look for any 6-digit number near "OTP" keyword
            const lines = pageText.split('\n');
            for (const line of lines) {
                if (line.toLowerCase().includes('otp') || line.toLowerCase().includes('vfs')) {
                    const match = line.match(/\b(\d{6})\b/);
                    if (match) {
                        otpMatch = match;
                        break;
                    }
                }
            }
        }

        if (!otpMatch) {
            // Last resort: any 6-digit number
            otpMatch = pageText.match(/\b(\d{6})\b/);
        }

        if (otpMatch) {
            const otp = otpMatch[1];
            console.log(`   ✅ OTP FOUND: ${otp}`);

            try {
                await page.screenshot({ path: './screenshots/mailnesia-otp-found.png', fullPage: true });
                console.log('   📸 Screenshot saved');
            } catch (e) { }

            return otp;
        } else {
            console.log('   ⚠️ No OTP pattern found in email');
            console.log(`   📄 Content preview: ${pageText.substring(0, 500)}...`);
        }

        return null;

    } catch (error) {
        console.log('   ❌ Error:', error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log('   ✅ Browser closed');
        }
    }
}

export async function waitForMailnesiaOTP(
    config: MailnesiaConfig,
    maxRetries: number = 6,
    retryDelayMs: number = 10000
): Promise<string | null> {
    console.log(`   ⏳ Waiting for Mailnesia OTP (max ${maxRetries * retryDelayMs / 1000}s)...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`   🔄 Attempt ${attempt}/${maxRetries}...`);

        const otp = await fetchOTPFromMailnesia(config, 5);

        if (otp) {
            return otp;
        }

        if (attempt < maxRetries) {
            console.log(`   ⏳ Waiting ${retryDelayMs / 1000}s before retry...`);
            await new Promise(r => setTimeout(r, retryDelayMs));
        }
    }

    console.log('   ❌ OTP not received after maximum retries');
    return null;
}
