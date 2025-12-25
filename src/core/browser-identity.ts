/**
 * Browser Identity Manager (Smart/Deep Version)
 * 
 * Philosophy: "Authenticity over Evasion."
 * Instead of faking a random Chrome version (which mismatches the actual binary features),
 * we capture the TRUE identity of the Playwright binary and consistently reuse it.
 * This prevents "Navigator/UA Mismatch" detection.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface BrowserProfile {
    id: string;
    createdAt: string;
    lastUsedAt: string;
    userAgent: string;
    viewport: { width: number; height: number };
    locale: string;
    timezone: string;
    colorScheme: 'light' | 'dark';
    deviceScaleFactor: number;
    sessionCount: number;
}

export interface IdentityConfig {
    profilesDir: string;
    profileId?: string;
    headless: boolean;
    persistSession: boolean;
    proxy?: {
        server: string;
        username?: string;
        password?: string;
    };
}

const DEFAULT_CONFIG: IdentityConfig = {
    profilesDir: './browser-profiles',
    headless: false,
    persistSession: true,
};

// We NO LONGER fake random UAs. We rely on the binary's actual UA.
function getDefaultViewport(): { width: number; height: number } {
    return { width: 1750, height: 960 };
}

export class BrowserIdentityManager {
    private config: IdentityConfig;
    private profile: BrowserProfile | null = null;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;

    constructor(config: Partial<IdentityConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.ensureProfilesDir();
    }

    private ensureProfilesDir(): void {
        if (!fs.existsSync(this.config.profilesDir)) {
            fs.mkdirSync(this.config.profilesDir, { recursive: true });
        }
    }

    private getProfilePath(): string {
        const profileId = this.config.profileId || 'default';
        return path.join(this.config.profilesDir, `${profileId}.json`);
    }

    private getStoragePath(): string {
        const profileId = this.config.profileId || 'default';
        return path.join(this.config.profilesDir, `${profileId}.json`);
    }

    /**
     * Load existing profile or prepare to create one
     */
    private loadOrCreateProfile(): BrowserProfile {
        const profilePath = this.getProfilePath();

        if (fs.existsSync(profilePath)) {
            const data = fs.readFileSync(profilePath, 'utf-8');
            const profile = JSON.parse(data) as BrowserProfile;
            profile.lastUsedAt = new Date().toISOString();
            profile.sessionCount++;
            console.log(`📂 Loaded existing profile: ${profile.id} (session #${profile.sessionCount})`);
            return profile;
        }

        // Create a SKELETON profile. We will fill the REAL UA after launch.
        const profile: BrowserProfile = {
            id: this.config.profileId || crypto.randomUUID().split('-')[0],
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            userAgent: '', // Will be captured from real browser
            viewport: getDefaultViewport(),
            locale: 'en-US',
            timezone: 'Asia/Dubai',
            colorScheme: 'light',
            deviceScaleFactor: 1,
            sessionCount: 1,
        };

        console.log(`🆕 Initializing new profile: ${profile.id}`);
        return profile;
    }

    private saveProfile(): void {
        if (!this.profile) return;
        const profilePath = this.getProfilePath();
        fs.writeFileSync(profilePath, JSON.stringify(this.profile, null, 2));
    }

    async launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
        this.profile = this.loadOrCreateProfile();

        console.log(`🚀 Launching browser (${this.config.headless ? 'headless' : 'headed'} mode)...`);

        // Launch arguments - minimal and clean
        const launchArgs = [
            '--no-default-browser-check',
            '--no-first-run',
            '--disable-infobars',
            '--disable-blink-features=AutomationControlled', // Critical: Hides navigator.webdriver
            `--window-size=${this.profile.viewport.width},${this.profile.viewport.height + 85}`,
        ];

        if (this.config.headless) {
            launchArgs.push('--headless=new');
        }

        this.browser = await chromium.launch({
            headless: false, // We control headless via args
            channel: 'chrome', // Try to use installed Chrome if available
            args: launchArgs,
            ignoreDefaultArgs: ['--enable-automation'],
        });

        // 1. Capture Authentic User Agent (Config-Time Alignment)
        if (!this.profile.userAgent) {
            console.log('   🕵️ New profile detected: Capturing authentic identity...');

            // Create TEMP context to sniff the binary's default UA
            const tempContext = await this.browser.newContext();
            const tempPage = await tempContext.newPage();
            let realUA = await tempPage.evaluate(() => navigator.userAgent);
            await tempContext.close(); // Close temp

            // SANITIZATION: If 'HeadlessChrome' is detected, strip 'Headless' to prevent immediate blocking
            if (realUA.includes('Headless')) {
                console.log(`   🚨 Detected "Headless" in raw UA: ${realUA}`);
                console.log('   🧹 Sanitizing to "Chrome" for safe cold-start...');
                realUA = realUA.replace('HeadlessChrome', 'Chrome').replace('Headless', '');
            }

            this.profile.userAgent = realUA;
            this.saveProfile();
        }

        // 2. Launch FINAL Context with the (now guaranteed safe) UA
        const contextOptions: any = {
            viewport: this.profile.viewport,
            locale: this.profile.locale,
            timezoneId: this.profile.timezone,
            deviceScaleFactor: this.profile.deviceScaleFactor,
            permissions: ['geolocation'],
            geolocation: { latitude: 25.2048, longitude: 55.2708 },
            userAgent: this.profile.userAgent // Must be explicit
        };

        const storageStatePath = path.join(this.config.profilesDir, `${this.config.profileId}-state.json`);
        if (fs.existsSync(storageStatePath)) {
            contextOptions.storageState = storageStatePath;
        }

        this.context = await this.browser.newContext(contextOptions);
        const page = await this.context.newPage();

        // 3. Apply Deep Stealth patches (Runtime Environment Alignment)
        await this.applySmartStealth(page);

        // Save session on close
        this.context.on('close', async () => {
            try {
                if (this.context?.pages().length) {
                    const state = await this.context.storageState();
                    fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
                    this.saveProfile();
                }
            } catch (e) { /* ignore */ }
        });

        return { browser: this.browser, context: this.context, page };
    }

    /**
     * Smart Stealth: Injects only what is missing, with deep mocking
     */
    private async applySmartStealth(page: Page): Promise<void> {
        await page.addInitScript(`
            console.log('🛡️ Active Stealth System: Engaging...');

            // 1. Hide Automation flag (Double check)
            if (navigator.webdriver) {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            }

            // 2. Deep Mock of window.chrome (The "Star" of the fix)
            // Cloudflare checks for: chrome.runtime, chrome.loadTimes, chrome.csi, chrome.app
            if (!window.chrome) {
                const mk = {
                    runtime: {
                        OnInstalledReason: {
                            CHROME_UPDATE: "chrome_update",
                            INSTALL: "install",
                            SHARED_MODULE_UPDATE: "shared_module_update",
                            UPDATE: "update"
                        },
                        OnRestartRequiredReason: {
                            APP_UPDATE: "app_update",
                            OS_UPDATE: "os_update",
                            PERIODIC: "periodic"
                        },
                        PlatformArch: {
                            ARM: "arm",
                            ARM64: "arm64",
                            MIPS: "mips",
                            MIPS64: "mips64",
                            X86_32: "x86-32",
                            X86_64: "x86-64"
                        },
                        PlatformNaclArch: {
                            ARM: "arm",
                            MIPS: "mips",
                            MIPS64: "mips64",
                            X86_32: "x86-32",
                            X86_64: "x86-64"
                        },
                        PlatformOs: {
                            ANDROID: "android",
                            CROS: "cros",
                            LINUX: "linux",
                            MAC: "mac",
                            OPENBSD: "openbsd",
                            WIN: "win"
                        },
                        RequestUpdateCheckStatus: {
                            NO_UPDATE: "no_update",
                            THROTTLED: "throttled",
                            UPDATE_AVAILABLE: "update_available"
                        },
                        connect: function() { return { onMessage: { addListener: function() {}, removeListener: function() {} }, postMessage: function() {}, disconnect: function() {} }; },
                        sendMessage: function() { },
                    },
                    loadTimes: function() { 
                        return {
                            get requestTime() { return performance.timing.navigationStart / 1000; },
                            get startLoadTime() { return performance.timing.navigationStart / 1000; },
                            get commitLoadTime() { return performance.timing.responseStart / 1000; },
                            get finishDocumentLoadTime() { return performance.timing.domContentLoadedEventEnd / 1000; },
                            get finishLoadTime() { return performance.timing.loadEventEnd / 1000; },
                            get firstPaintTime() { return performance.timing.responseStart / 1000; },
                            get firstPaintAfterLoadTime() { return 0; },
                            get navigationType() { return "Other"; },
                            get wasFetchedViaSpdy() { return true; },
                            get wasNpnNegotiated() { return true; },
                            get npnNegotiatedProtocol() { return "h2"; },
                            get wasAlternateProtocolAvailable() { return false; },
                            get connectionInfo() { return "h2"; }
                        };
                    },
                    csi: function() { 
                        return {
                            startE: performance.timing.navigationStart,
                            onloadT: performance.timing.domContentLoadedEventEnd,
                            pageT: performance.timing.loadEventEnd - performance.timing.navigationStart,
                            tran: 15
                        };
                    },
                    app: {
                        isInstalled: false,
                        getIsInstalled: function() { return false; },
                        getDetails: function() { return null; },
                        installState: function() { return "not_installed"; },
                        runningState: function() { return "cannot_run"; }
                    },
                    webstore: {
                        onInstallStageChanged: {},
                        onDownloadProgress: {},
                        install: function() {}
                    }
                };
                
                Object.defineProperty(window, 'chrome', {
                    get: () => mk,
                    enumerable: true,
                });
            }

            // 3. Permissions Query (Common evasion)
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // 4. Plugins
            if (navigator.plugins.length === 0) {
                 Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        return [
                            {
                                0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
                                description: "Portable Document Format",
                                filename: "internal-pdf-viewer",
                                length: 1,
                                name: "Chrome PDF Plugin"
                            },
                             {
                                0: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
                                description: "Portable Document Format",
                                filename: "internal-pdf-viewer",
                                length: 1,
                                name: "PDF Viewer"
                            }
                        ];
                    },
                });
            }
        `);
    }

    async close() {
        if (this.context) await this.context.close();
        if (this.browser) await this.browser.close();
    }

    getProfile(): BrowserProfile | null {
        return this.profile;
    }

    isWarmSession(): boolean {
        const storageStatePath = path.join(this.config.profilesDir, `${this.config.profileId}-state.json`);
        return fs.existsSync(storageStatePath);
    }
}
