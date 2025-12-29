
import { BrowserIdentityManager } from '../core/browser-identity.js';
import { EnvironmentMonitor } from '../core/environment-monitor.js';

async function main() {
    console.log('\n🔍 Verifying Sign-Up Page Accessibility (Stealth Check)...\n');

    const identity = new BrowserIdentityManager({
        headless: false, // Headed for visual verification
        persistSession: true,
        profilesDir: './browser-profiles',
    });

    try {
        const { page } = await identity.launch();
        const startUrl = 'https://visa.vfsglobal.com/are/en/ita/login';

        console.log(`📍 Navigating to Login Page: ${startUrl}`);
        await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

        // Wait for "New User" or "Register" link
        console.log('🔎 Looking for Registration link...');

        // VFS often has "New User? click here"
        const registerLink = page.locator('a:has-text("New User"), a:has-text("Register"), a:has-text("Sign up")').first();

        if (await registerLink.isVisible()) {
            console.log('✅ Found Registration link. Clicking...');
            await registerLink.click();
        } else {
            // Fallback: Try direct navigation if link not found (common in separate flows)
            // But usually it's there.
            console.log('⚠️ Link not found. Attempting to match "register" in URL if redirected?');
        }

        console.log('⏳ Waiting for Registration Page to load...');
        await page.waitForLoadState('networkidle');

        // Check for indicators
        const isSecure = await page.evaluate(() => !navigator.webdriver);
        console.log(`   🕵️ Stealth Status: ${isSecure ? 'Secure' : 'Detected'}`);

        const blocked = await page.locator('text="Access denied"').isVisible() ||
            await page.locator('text="Error 403"').isVisible();

        if (blocked) {
            console.error('❌ Failed: Blocked by WAF on Sign-Up Page.');
        } else {
            console.log('✅ Success: Sign-Up Page loaded without block.');
            console.log('   (Stopping here to prevent OTP trigger)');
        }

        // Keep open briefly
        await page.waitForTimeout(5000);

    } catch (e) {
        console.error('💥 Error during check:', e);
    } finally {
        await identity.close();
    }
}

main().catch(console.error);
