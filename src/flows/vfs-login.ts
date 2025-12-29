/**
 * VFS Global Login Flow
 * 
 * Philosophy: "The system observes outcomes instead of assuming success.
 * Login success, partial failure, or rejection are treated as valid states.
 * Behavior adapts calmly, not reactively."
 * 
 * This module orchestrates the complete login flow for VFS Global Italy visa
 * appointments, using all human-indistinguishable behavior patterns.
 */

import { Page } from 'playwright';
import {
    HumanTimingEngine,
    BehaviorSimulator,
    UISignalHandler,
    EnvironmentMonitor,
    type StateIndicators,
} from '../core/index.js';
import { waitForOTP, type GmailConfig } from '../utils/gmail-otp.js';

export interface LoginCredentials {
    email: string;
    password: string;
    gmailConfig?: GmailConfig; // For OTP fetching (VFS Italy)
}

export interface LoginResult {
    success: boolean;
    state: 'logged_in' | 'failed' | 'blocked' | 'captcha_required' | 'maintenance';
    message: string;
    screenshot?: string;
    retryAfter?: number;
}

export interface LoginFlowConfig {
    loginUrl: string;
    maxAttempts: number;
    screenshotOnError: boolean;
}

const DEFAULT_CONFIG: LoginFlowConfig = {
    loginUrl: 'https://visa.vfsglobal.com/are/en/ita/login',
    maxAttempts: 1, // Single attempt per session (human-like)
    screenshotOnError: true,
};

/**
 * VFS Login Flow Orchestrator
 * 
 * Implements the complete login process with human-indistinguishable behavior.
 * Each step mimics exactly how a real user would interact with the page.
 */
export class VFSLoginFlow {
    private page: Page;
    private timing: HumanTimingEngine;
    private behavior: BehaviorSimulator;
    private uiHandler: UISignalHandler;
    private envMonitor: EnvironmentMonitor;
    private config: LoginFlowConfig;

    constructor(page: Page, config: Partial<LoginFlowConfig> = {}) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.timing = new HumanTimingEngine();
        this.behavior = new BehaviorSimulator(page, this.timing);
        this.uiHandler = new UISignalHandler(page, this.behavior, this.timing);
        this.envMonitor = new EnvironmentMonitor();
    }

    /**
     * Execute the complete login flow
     */
    async execute(credentials: LoginCredentials): Promise<LoginResult> {
        console.log('\n' + '═'.repeat(60));
        console.log('🔐 VFS Global Login Flow - Human Behavior Mode');
        console.log('═'.repeat(60) + '\n');

        try {
            // Step 1: Navigate to login page
            const navResult = await this.navigateToLogin();
            if (!navResult.success) return navResult;

            // Step 2: Check environment state
            const envState = await this.checkEnvironment();
            if (!envState.actionable) {
                return {
                    success: false,
                    state: envState.state === 'maintenance' ? 'maintenance' : 'blocked',
                    message: envState.message,
                    retryAfter: envState.retryAfter,
                };
            }

            // Step 3: Handle cookie consent (natural delay first)
            await this.handleCookieConsent();

            // Step 4: Human reading/orientation pause
            console.log('👀 Observing page layout...');
            await new Promise(r => setTimeout(r, this.timing.getThinkingPause('moderate')));

            // Step 5: Fill and submit login form (with retry)
            let loginResult: LoginResult = { success: false, state: 'failed', message: 'Not attempted' };

            for (let attempt = 1; attempt <= 2; attempt++) {
                if (attempt > 1) {
                    console.log(`\n🔄 Retry attempt ${attempt}/2 due to session issue check...`);
                    // Refresh page to reset session
                    await this.page.reload({ waitUntil: 'domcontentloaded' });
                    await new Promise(r => setTimeout(r, 2000));
                }

                loginResult = await this.performLogin(credentials);

                // If session expired, retry
                if (loginResult.message.toLowerCase().includes('session expired') ||
                    loginResult.message.toLowerCase().includes('invalid')) {
                    // Sometimes "invalid" is just a glitch, try once more if it was the first try
                    console.log(`   ⚠️ Potential session issue: ${loginResult.message}`);
                    if (attempt < 2) continue;
                }

                if (loginResult.success) break;
            }

            return loginResult;

        } catch (error) {
            console.error('❌ Login flow error:', error);

            if (this.config.screenshotOnError) {
                const screenshotPath = `./error-${Date.now()}.png`;
                await this.page.screenshot({ path: screenshotPath });
                console.log(`📸 Screenshot saved: ${screenshotPath}`);
            }

            return {
                success: false,
                state: 'failed',
                message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`,
            };
        }
    }

    /**
     * Step 1: Navigate directly to login page
     * 
     * With fresh IP from VPN/WARP, try direct login first.
     * If blocked, can fall back to home page strategy.
     */
    private async navigateToLogin(): Promise<LoginResult> {
        console.log('🌐 Navigating to login page...');

        try {
            // Go directly to login page
            const loginUrl = this.config.loginUrl;

            console.log(`   📍 Opening: ${loginUrl}`);

            // Perform warm-up if starting fresh
            await this.performWarmup();

            await new Promise(r => setTimeout(r, this.timing.getActionDelay('navigate')));

            await this.page.goto(loginUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });

            // Wait for page to stabilize
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
                console.log('   ⏳ Network still active, continuing...');
            });

            // VFS uses Angular SPA - wait for the loader to disappear
            console.log('   ⏳ Waiting for Angular app to load...');

            // Wait for loader to disappear (VFS shows a loader gif while Angular loads)
            try {
                await this.page.waitForSelector('#loader', { state: 'hidden', timeout: 15000 });
                console.log('   ✅ Loader disappeared');
            } catch {
                console.log('   ⏳ Loader selector not found, continuing...');
            }

            // Wait for some content to appear in app-root (Angular has rendered)
            try {
                await this.page.waitForSelector('app-root *:not(:empty)', { timeout: 15000 });
                console.log('   ✅ Angular app rendered');
            } catch {
                console.log('   ⏳ Angular app still loading...');
            }

            // Extra wait for any remaining JavaScript execution
            await new Promise(r => setTimeout(r, 3000));

            // Log current URL for debugging
            const currentUrl = this.page.url();
            console.log(`   📍 Current URL: ${currentUrl}`);

            // Check if we hit an error page
            if (currentUrl.includes('page-not-found')) {
                console.log('   ⚠️ Got redirected to error page');
                await this.page.screenshot({ path: './debug-navigation.png' });
                console.log('   📸 Saved debug screenshot');
            }

            // Human reaction to page load
            console.log('✅ Page loaded');
            await new Promise(r => setTimeout(r, this.timing.getActionDelay('navigate')));

            return {
                success: true,
                state: 'logged_in', // Will be updated later
                message: 'Navigation successful',
            };

        } catch (error) {
            console.log(`   ❌ Navigation error: ${error instanceof Error ? error.message : 'Unknown'}`);
            return {
                success: false,
                state: 'failed',
                message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown'}`,
            };
        }
    }

    /**
     * Perform warm-up behavior (visit homepage, scroll, act human)
     */
    private async performWarmup(): Promise<void> {
        console.log('🌡️ Performing warm-up behavior...');
        try {
            // Visit a "safe" page first (e.g., homepage or google)
            // Ideally just the base domain
            const baseUrl = new URL(this.config.loginUrl).origin;
            await this.page.goto(baseUrl + '/are/en/ita/', { waitUntil: 'domcontentloaded', timeout: 30000 });

            console.log('   (Skipped warm-up for speed)');
            await new Promise(r => setTimeout(r, 100));

            console.log('   ✅ Warm-up complete');
        } catch (e) {
            console.log('   ⚠️ Warm-up had minor issue (ignoring):', e);
        }
    }

    /**
     * Step 2: Check page environment for blocks/maintenance
     */
    private async checkEnvironment(): Promise<StateIndicators> {
        console.log('🔍 Checking environment state...');

        const pageTitle = await this.page.title();
        const pageUrl = this.page.url();
        const pageContent = await this.page.textContent('body').catch(() => '') || '';

        const state = await this.envMonitor.detectState({
            pageTitle,
            pageUrl,
            pageContent,
        });

        if (state.state !== 'healthy') {
            console.log(`⚠️ ${state.message}`);
            if (state.retryAfter) {
                console.log(`   Suggested wait: ${EnvironmentMonitor.formatWaitTime(state.retryAfter)}`);
            }
        } else {
            console.log('✅ Environment healthy');
        }

        return state;
    }

    /**
     * Step 3: Handle cookie consent naturally
     */
    private async handleCookieConsent(): Promise<void> {
        console.log('🍪 Checking for cookie consent...');

        // Brief pause to "notice" the banner
        await new Promise(r => setTimeout(r, 100));

        const handled = await this.uiHandler.handleVFSCookieConsent();

        if (handled) {
            console.log('✅ Cookie consent handled');
            // Wait for banner to disappear
            await new Promise(r => setTimeout(r, this.timing.getActionDelay('click')));
        } else {
            console.log('ℹ️  No cookie banner detected');
        }
    }

    /**
     * Step 4 & 5: Perform the actual login
     */
    private async performLogin(credentials: LoginCredentials): Promise<LoginResult> {
        console.log('📝 Filling login form...\n');

        try {
            // Verify stealth status
            const isWebdriver = await this.page.evaluate(() => navigator.webdriver);
            console.log(`   🕵️ Stealth Check: navigator.webdriver = ${isWebdriver} (Should be false)`);

            // Form is ready after loader disappears - no additional wait needed

            // Find email input
            const emailInput = await this.findLoginField('email');
            if (!emailInput) {
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not find email input field',
                };
            }

            // Fill email INSTANTLY (Native fill)
            console.log('   📧 Entering email...');
            await emailInput.fill(credentials.email);

            // Find password input
            const passwordInput = await this.findLoginField('password');
            if (!passwordInput) {
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not find password input field',
                };
            }

            // Fill password INSTANTLY (Native fill)
            console.log('   🔑 Entering password...');
            await passwordInput.fill(credentials.password);

            // Pre-submit review (Skipped for speed)
            await new Promise(r => setTimeout(r, 100));

            // Handle Cloudflare Turnstile checkbox
            console.log('   Looking for Cloudflare Turnstile...');
            const turnstileHandled = await this.handleCloudfareTurnstile();

            if (turnstileHandled) {
                console.log('   Turnstile clicked, waiting for verification...');

                // Wait up to 15 seconds for verification
                let verified = false;
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    process.stdout.write('.');

                    // Check if Sign In button is enabled (indicates verification success)
                    const isEnabled = await this.page.evaluate(() => {
                        const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                        return btn && !btn.disabled;
                    });

                    if (isEnabled) {
                        verified = true;
                        console.log('\n   ✅ Verification successful!');
                        break;
                    }
                }

                if (!verified) {
                    console.log('\n   ⚠️ Verification may have failed (button still disabled)');
                }
            }

            // Manual fallback removed - fully automated
            console.log('   (Automated Cloudflare check completed.)\n');

            // Find and click submit button
            const submitButton = await this.findSubmitButton();
            if (!submitButton) {
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not find submit button',
                };
            }

            // Submit with natural hesitation
            console.log('   🖱️  Submitting...\n');
            await this.behavior.submitForm(submitButton);

            console.log('   🎉 Congrats! Script ran successfully. Button clicked.');

            // Smart polling for dashboard
            console.log('⏳ Waiting for dashboard to appear...');

            let onDashboard = false;
            for (let i = 0; i < 30; i++) {
                const url = this.page.url();
                if (url.includes('dashboard') ||
                    url.includes('application-center') ||
                    await this.page.locator('button:has-text("Start New Booking")').isVisible().catch(() => false)) {
                    console.log('   ✅ Dashboard detected!');
                    onDashboard = true;
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (!onDashboard) console.log('   ⚠️ Dashboard wait timeout - checking anyway...');

            await new Promise(r => setTimeout(r, 500));

            // Check for OTP page (VFS Italy)
            const otpPageDetected = await this.isOTPPage();
            if (otpPageDetected && credentials.gmailConfig) {
                console.log('\n📱 OTP page detected - handling OTP verification...');
                const otpResult = await this.handleOTPPage(credentials.gmailConfig);
                if (!otpResult) {
                    return {
                        success: false,
                        state: 'failed',
                        message: 'OTP verification failed'
                    };
                }
                // After OTP, wait for dashboard again
                console.log('⏳ Waiting for dashboard after OTP...');
                for (let i = 0; i < 30; i++) {
                    const url = this.page.url();
                    if (url.includes('dashboard') || url.includes('application-center')) {
                        console.log('   ✅ Dashboard detected after OTP!');
                        break;
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Analyze result
            return await this.analyzeLoginResult();

        } catch (error) {
            return {
                success: false,
                state: 'failed',
                message: `Login interaction failed: ${error instanceof Error ? error.message : 'Unknown'}`,
            };
        }
    }

    /**
     * Find email or password input field with extensive fallback selectors
     */
    private async findLoginField(type: 'email' | 'password') {
        const selectors = type === 'email' ? [
            // Standard selectors
            'input[type="email"]',
            'input[name="email"]',
            'input[name="username"]',
            'input[name="EmailId"]',
            'input[name="emailId"]',
            // ID-based selectors
            'input[id="email"]',
            'input[id="username"]',
            'input[id="EmailId"]',
            'input[id*="email"]',
            'input[id*="user"]',
            'input[id*="Email"]',
            // Class-based selectors
            'input[class*="email"]',
            'input[class*="user"]',
            // Placeholder-based selectors
            'input[placeholder*="email" i]',
            'input[placeholder*="user" i]',
            'input[placeholder*="Email" i]',
            // Form context
            'form input[type="text"]:first-of-type',
            // Angular/React common patterns
            'input[formcontrolname="email"]',
            'input[formcontrolname="username"]',
            'input[data-testid*="email"]',
            // Generic text input (last resort)
            '.login-form input[type="text"]',
            '[class*="login"] input[type="text"]',
        ] : [
            // Standard selectors
            'input[type="password"]',
            'input[name="password"]',
            'input[name="Password"]',
            // ID-based selectors
            'input[id="password"]',
            'input[id="Password"]',
            'input[id*="password"]',
            'input[id*="Password"]',
            // Class-based selectors
            'input[class*="password"]',
            // Placeholder-based selectors
            'input[placeholder*="password" i]',
            'input[placeholder*="Password" i]',
            // Angular/React common patterns
            'input[formcontrolname="password"]',
            'input[data-testid*="password"]',
            // Form context
            '.login-form input[type="password"]',
            '[class*="login"] input[type="password"]',
        ];

        console.log(`      🔎 Searching for ${type} field...`);

        for (const selector of selectors) {
            try {
                const field = this.page.locator(selector).first();
                const isVisible = await field.isVisible({ timeout: 2000 }).catch(() => false);

                if (isVisible) {
                    console.log(`      ✅ Found ${type} with selector: ${selector}`);
                    return field;
                }
            } catch {
                // Continue to next selector
            }
        }

        // Debug: Take screenshot and log page state
        console.log(`      ❌ Could not find ${type} field. Taking debug screenshot...`);
        const screenshotPath = `./debug-${type}-not-found-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`      📸 Debug screenshot saved: ${screenshotPath}`);

        // Log available inputs on page
        const allInputs = await this.page.locator('input').all();
        console.log(`      📋 Total input fields on page: ${allInputs.length}`);

        for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
            const input = allInputs[i];
            const attrs = await input.evaluate(el => ({
                type: el.getAttribute('type'),
                name: el.getAttribute('name'),
                id: el.getAttribute('id'),
                placeholder: el.getAttribute('placeholder'),
                className: el.className.slice(0, 50),
            }));
            console.log(`         Input ${i + 1}: type="${attrs.type}" name="${attrs.name}" id="${attrs.id}" placeholder="${attrs.placeholder}"`);
        }

        return null;
    }

    /**
     * Find submit/login button
     */
    private async findSubmitButton() {
        const selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            'button:has-text("Login")',
            'button:has-text("Continue")',
            'button[id*="login"]',
            'button[id*="submit"]',
            '[class*="login-btn"]',
            '[class*="submit-btn"]',
        ];

        for (const selector of selectors) {
            const button = this.page.locator(selector).first();
            const isVisible = await button.isVisible({ timeout: 500 }).catch(() => false);

            if (isVisible) {
                return button;
            }
        }

        return null;
    }

    /**
     * Wait for user to complete Turnstile verification
     * 
     * Polls the page to check if the Sign In button becomes enabled
     * (which indicates Turnstile verification is complete)
     */
    private async waitForTurnstileCompletion(timeoutMs: number): Promise<boolean> {
        const startTime = Date.now();
        const pollInterval = 1000; // Check every second

        while (Date.now() - startTime < timeoutMs) {
            // Check if Sign In button is enabled
            const isEnabled = await this.page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const btn of buttons) {
                    if (btn.textContent?.toLowerCase().includes('sign in') ||
                        btn.textContent?.toLowerCase().includes('login')) {
                        return !btn.disabled;
                    }
                }
                // Also check for submit button
                const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                return submit && !submit.disabled;
            });

            if (isEnabled) {
                return true;
            }

            // Wait before next poll
            await new Promise(r => setTimeout(r, pollInterval));

            // Show progress dots
            process.stdout.write('.');
        }

        console.log(''); // New line after dots
        return false;
    }

    /**
     * Handle Cloudflare Turnstile checkbox
     * 
     * Turnstile is embedded in an iframe. We need to use JavaScript evaluation
     * to properly interact with it across iframe boundaries.
     */
    private async handleCloudfareTurnstile(): Promise<boolean> {
        console.log('      🔍 Scanning for Turnstile widget...');

        // Quick wait for Turnstile to render
        await new Promise(r => setTimeout(r, 1000));

        // First, let's see what iframes exist on the page
        const iframeInfo = await this.page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            return iframes.map((iframe, index) => ({
                index,
                src: iframe.src || 'no-src',
                title: iframe.title || 'no-title',
                name: iframe.name || 'no-name',
                width: iframe.offsetWidth,
                height: iframe.offsetHeight,
                visible: iframe.offsetWidth > 0 && iframe.offsetHeight > 0,
            }));
        });

        console.log(`      📋 Found ${iframeInfo.length} iframes on page`);

        // Method 0: VFS Global specific - click the captcha container directly
        const vfsSelectors = [
            'app-cloudflare-captcha-container',
            '[appcloudflarerecaptcha]',
            '.cf-turnstile',
        ];

        for (const selector of vfsSelectors) {
            try {
                const container = this.page.locator(selector).first();
                if (await container.isVisible({ timeout: 1000 })) {
                    console.log(`      🎯 Found VFS captcha container: ${selector}`);

                    const box = await container.boundingBox();
                    if (box) {
                        // Click on the LEFT side where the checkbox is
                        const clickX = box.x + 25;
                        const clickY = box.y + box.height / 2;

                        console.log(`      📍 Clicking at (${Math.round(clickX)}, ${Math.round(clickY)})`);
                        await this.page.mouse.click(clickX, clickY);

                        console.log('      ✅ Clicked Turnstile checkbox!');
                        return true;
                    }
                }
            } catch {
                continue;
            }
        }

        // Look for Turnstile iframe (fallback)
        for (const iframe of iframeInfo) {
            const isTurnstile =
                iframe.src.includes('turnstile') ||
                iframe.src.includes('challenges.cloudflare') ||
                iframe.title.toLowerCase().includes('cloudflare') ||
                iframe.title.toLowerCase().includes('widget');

            if (isTurnstile && iframe.visible) {
                console.log(`      🎯 Found Turnstile iframe: ${iframe.src.slice(0, 50)}...`);
            }
        }

        // Method 1: Try to find and click via frameLocator
        const iframeSelectors = [
            'iframe[src*="turnstile"]',
            'iframe[src*="challenges.cloudflare"]',
            'iframe[title*="Widget"]',
            'iframe[title*="containing checkbox"]',
        ];

        for (const selector of iframeSelectors) {
            try {
                const iframe = this.page.locator(selector).first();
                if (await iframe.isVisible({ timeout: 1000 })) {
                    console.log(`      🔍 Trying iframe: ${selector}`);

                    // Click on the iframe itself - this often triggers the checkbox
                    const box = await iframe.boundingBox();
                    if (box) {
                        // Click in the center of the iframe
                        await this.page.mouse.click(
                            box.x + box.width / 2,
                            box.y + box.height / 2
                        );
                        console.log('      ✅ Clicked center of Turnstile iframe');

                        // Wait for verification
                        await new Promise(r => setTimeout(r, 2000));
                        return true;
                    }
                }
            } catch {
                continue;
            }
        }

        // Method 2: Find all visible iframes and click on them
        for (const iframe of iframeInfo) {
            if (iframe.visible && iframe.width > 20 && iframe.height > 20) {
                try {
                    const iframeEl = this.page.locator('iframe').nth(iframe.index);
                    const box = await iframeEl.boundingBox();

                    if (box && box.width > 20 && box.height > 20) {
                        console.log(`      🔍 Trying iframe ${iframe.index} at position (${box.x}, ${box.y})`);

                        // Click near the left side where checkbox typically is
                        await this.page.mouse.click(box.x + 25, box.y + box.height / 2);
                        console.log('      ✅ Clicked iframe');

                        await new Promise(r => setTimeout(r, 1500));

                        // Check if checkbox got checked (Sign In button might become enabled)
                        const signInEnabled = await this.page.evaluate(() => {
                            const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                            return btn && !btn.disabled;
                        });

                        if (signInEnabled) {
                            console.log('      ✅ Sign In button is now enabled!');
                            return true;
                        }
                    }
                } catch {
                    continue;
                }
            }
        }

        // Method 3: Look for elements near the Sign In button
        try {
            const widgetBox = await this.page.evaluate(() => {
                // Find elements that might be the Turnstile container
                // VFS-specific selectors based on DOM inspection
                const candidates = [
                    // VFS Global specific selectors (from DOM inspection)
                    document.querySelector('app-cloudflare-captcha-container'),
                    document.querySelector('[appcloudflarerecaptcha]'),
                    document.querySelector('[class*="captcha-container"]'),
                    // Generic Cloudflare selectors
                    document.querySelector('[class*="turnstile"]'),
                    document.querySelector('[class*="cf-"]'),
                    document.querySelector('[id*="turnstile"]'),
                    // Find elements containing "Verify you are human" text
                    ...Array.from(document.querySelectorAll('*')).filter(
                        el => el.textContent?.includes('Verify you are human')
                    ),
                ];

                for (const el of candidates) {
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                        }
                    }
                }
                return null;
            });

            if (widgetBox) {
                console.log(`      🎯 Found Turnstile widget area`);
                // Click on the left side where checkbox is
                await this.page.mouse.click(widgetBox.x + 20, widgetBox.y + widgetBox.height / 2);
                console.log('      ✅ Clicked Turnstile widget');
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }
        } catch {
            // Continue
        }

        console.log('      ℹ️ Could not find or click Turnstile checkbox');
        return false;
    }

    /**
     * Analyze the result after login attempt
     */
    private async analyzeLoginResult(): Promise<LoginResult> {
        // Wait for page to stabilize
        await new Promise(r => setTimeout(r, 2000));

        const pageUrl = this.page.url();
        const pageTitle = await this.page.title();
        const pageContent = await this.page.textContent('body').catch(() => '') || '';

        // Check for success indicators
        const successIndicators = [
            /dashboard/i,
            /my\s*appointments/i,
            /welcome/i,
            /schedule/i,
            /book\s*appointment/i,
        ];

        for (const indicator of successIndicators) {
            if (indicator.test(pageUrl) || indicator.test(pageContent)) {
                console.log('🎉 Login successful!');
                return {
                    success: true,
                    state: 'logged_in',
                    message: 'Successfully logged in',
                };
            }
        }

        // Check for error indicators
        const errorIndicators = [
            { pattern: /invalid\s*(email|password|credentials)/i, message: 'Invalid credentials' },
            { pattern: /incorrect\s*(email|password)/i, message: 'Incorrect login details' },
            { pattern: /account\s*locked/i, message: 'Account locked' },
            { pattern: /too\s*many\s*attempts/i, message: 'Too many login attempts' },
        ];

        for (const { pattern, message } of errorIndicators) {
            if (pattern.test(pageContent)) {
                console.log(`❌ Login failed: ${message}`);
                return {
                    success: false,
                    state: 'failed',
                    message,
                };
            }
        }

        // Check for captcha
        const captchaIndicators = [
            /captcha/i,
            /verify\s*you\s*are\s*human/i,
            /turnstile/i,
        ];

        for (const indicator of captchaIndicators) {
            if (indicator.test(pageContent)) {
                console.log('🤖 CAPTCHA detected');
                return {
                    success: false,
                    state: 'captcha_required',
                    message: 'CAPTCHA verification required',
                };
            }
        }

        // Check environment for blocks
        const envState = await this.envMonitor.detectState({
            pageTitle,
            pageUrl,
            pageContent,
        });

        if (!envState.actionable) {
            return {
                success: false,
                state: 'blocked',
                message: envState.message,
                retryAfter: envState.retryAfter,
            };
        }

        // Unknown state - assume still on login page
        console.log('❓ Login result unclear');
        return {
            success: false,
            state: 'failed',
            message: 'Login result could not be determined',
        };
    }

    /**
     * Check if the current page is the OTP verification page
     */
    private async isOTPPage(): Promise<boolean> {
        try {
            const url = this.page.url();
            const pageContent = await this.page.textContent('body').catch(() => '');

            // Check for OTP page indicators
            if (url.includes('/login') && pageContent) {
                const otpIndicators = [
                    /one time password.*otp/i,
                    /please enter your one time password/i,
                    /sent on e-mail.*sms.*whatsapp/i,
                ];

                for (const indicator of otpIndicators) {
                    if (indicator.test(pageContent)) {
                        return true;
                    }
                }

                // Check if OTP input field is visible
                const otpInput = this.page.locator('xpath=/html/body/app-root/div/main/div/app-login/section/div/div/mat-card/form/div[2]/mat-form-field/div[1]/div/div[2]/input').first();
                if (await otpInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Handle OTP page - fetch OTP from Gmail and submit
     */
    private async handleOTPPage(gmailConfig: GmailConfig): Promise<boolean> {
        try {
            console.log('📱 OTP page detected');
            console.log('   📧 Fetching OTP from Gmail...');

            // Wait for OTP email with retry
            const otp = await waitForOTP(gmailConfig, 6, 10000); // 6 retries, 10s each = 60s total

            if (!otp) {
                console.log('   ❌ Could not fetch OTP from Gmail');
                return false;
            }

            console.log(`   ✅ OTP retrieved: ${otp}`);

            // Find OTP input using user-provided XPath
            const otpInputSelectors = [
                'xpath=/html/body/app-root/div/main/div/app-login/section/div/div/mat-card/form/div[2]/mat-form-field/div[1]/div/div[2]/input',
                'input[placeholder*="one time password" i]',
                'input[placeholder*="otp" i]',
                'input[formcontrolname*="otp" i]',
            ];

            let otpInput: any = null;
            for (const selector of otpInputSelectors) {
                const input = this.page.locator(selector).first();
                if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
                    otpInput = input;
                    console.log(`   ✅ Found OTP input with: ${selector}`);
                    break;
                }
            }

            if (!otpInput) {
                console.log('   ❌ OTP input field not found');
                return false;
            }

            // Fill OTP
            console.log('   ✏️  Filling OTP...');
            await otpInput.fill(otp);
            await new Promise(r => setTimeout(r, 500));

            // Find and click Sign In button
            const signInSelectors = [
                'button:has-text("Sign in")',
                'button:has-text("Sign In")',
                'button:has-text("Submit")',
                'button[type="submit"]',
            ];

            let signInButton: any = null;
            for (const selector of signInSelectors) {
                const button = this.page.locator(selector).first();
                if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
                    signInButton = button;
                    console.log(`   ✅ Found Sign In button with: ${selector}`);
                    break;
                }
            }

            if (!signInButton) {
                console.log('   ⚠️ Sign In button not found, trying Enter key...');
                await this.page.keyboard.press('Enter');
            } else {
                console.log('   🖱️  Clicking Sign In...');
                await signInButton.click();
            }

            // Wait for navigation
            await new Promise(r => setTimeout(r, 2000));

            console.log('   ✅ OTP submitted successfully');
            return true;

        } catch (error) {
            console.log('   ❌ Error handling OTP page:', error);
            return false;
        }
    }
}
