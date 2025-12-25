/**
 * UI Signal Handler
 * 
 * Philosophy: "Cookie banners, maintenance notices, and alerts are treated as
 * user-facing signals. The system responds the same way a real user would:
 * visual acknowledgement, minor hesitation, intentional interaction.
 * No instant acceptance or dismissal patterns."
 * 
 * This module handles popups, modals, and overlays with natural human behavior.
 */

import { Page, Locator } from 'playwright';
import { BehaviorSimulator } from './behavior-simulator.js';
import { HumanTimingEngine } from './human-timing.js';

export interface UISignal {
    type: 'cookie_consent' | 'notification' | 'modal' | 'alert' | 'captcha' | 'overlay';
    detected: boolean;
    handled: boolean;
    timestamp: Date;
}

export interface SignalPattern {
    type: UISignal['type'];
    name: string;
    detectSelectors: string[];
    acceptSelectors: string[];
    dismissSelectors: string[];
    priority: number; // Higher = handle first
}

const COMMON_PATTERNS: SignalPattern[] = [
    {
        type: 'cookie_consent',
        name: 'Cookie Consent Banner',
        detectSelectors: [
            '[class*="cookie"]',
            '[class*="consent"]',
            '[id*="cookie"]',
            '[id*="consent"]',
            '#onetrust-banner-sdk',
            '.cc-banner',
            '[aria-label*="cookie"]',
            '[data-testid*="cookie"]',
        ],
        acceptSelectors: [
            'button[class*="accept"]',
            'button[id*="accept"]',
            '[class*="accept-all"]',
            '[class*="acceptAll"]',
            'button:has-text("Accept All")',
            'button:has-text("Accept all")',
            'button:has-text("Accept Cookies")',
            'button:has-text("Allow All")',
            'button:has-text("Allow all")',
            'button:has-text("I Accept")',
            'button:has-text("Got it")',
            'button:has-text("OK")',
            '#onetrust-accept-btn-handler',
        ],
        dismissSelectors: [
            'button[class*="reject"]',
            'button[class*="decline"]',
            'button:has-text("Reject")',
            'button:has-text("Decline")',
        ],
        priority: 10,
    },
    {
        type: 'notification',
        name: 'Push Notification Request',
        detectSelectors: [
            '[class*="notification-prompt"]',
            '[class*="push-prompt"]',
        ],
        acceptSelectors: [],
        dismissSelectors: [
            'button:has-text("Not Now")',
            'button:has-text("Later")',
            'button:has-text("No Thanks")',
            '[class*="close"]',
        ],
        priority: 5,
    },
    {
        type: 'modal',
        name: 'Generic Modal',
        detectSelectors: [
            '.modal.show',
            '[class*="modal"][class*="visible"]',
            '[role="dialog"][aria-modal="true"]',
        ],
        acceptSelectors: [
            'button:has-text("Continue")',
            'button:has-text("Proceed")',
        ],
        dismissSelectors: [
            'button[class*="close"]',
            'button[aria-label="Close"]',
            '.modal-close',
        ],
        priority: 3,
    },
    {
        type: 'overlay',
        name: 'Overlay/Interstitial',
        detectSelectors: [
            '[class*="overlay"][class*="visible"]',
            '[class*="interstitial"]',
        ],
        acceptSelectors: [],
        dismissSelectors: [
            '[class*="close"]',
            'button[aria-label="dismiss"]',
        ],
        priority: 2,
    },
];

export class UISignalHandler {
    private page: Page;
    private behavior: BehaviorSimulator;
    private timing: HumanTimingEngine;
    private handledSignals: UISignal[] = [];
    private customPatterns: SignalPattern[] = [];

    constructor(page: Page, behavior: BehaviorSimulator, timing?: HumanTimingEngine) {
        this.page = page;
        this.behavior = behavior;
        this.timing = timing || new HumanTimingEngine();
    }

    /**
     * Add custom signal pattern for specific site
     */
    addPattern(pattern: SignalPattern): void {
        this.customPatterns.push(pattern);
    }

    /**
     * Scan and handle all visible UI signals
     */
    async scanAndHandle(): Promise<UISignal[]> {
        const allPatterns = [...this.customPatterns, ...COMMON_PATTERNS]
            .sort((a, b) => b.priority - a.priority);

        const handled: UISignal[] = [];

        for (const pattern of allPatterns) {
            const result = await this.handlePattern(pattern);
            if (result.detected) {
                handled.push(result);
                // Wait between handling multiple signals
                if (result.handled) {
                    await new Promise(r => setTimeout(r, this.timing.getActionDelay('click')));
                }
            }
        }

        this.handledSignals.push(...handled);
        return handled;
    }

    /**
     * Handle a specific signal pattern
     */
    private async handlePattern(pattern: SignalPattern): Promise<UISignal> {
        const signal: UISignal = {
            type: pattern.type,
            detected: false,
            handled: false,
            timestamp: new Date(),
        };

        // Try to detect the signal
        for (const selector of pattern.detectSelectors) {
            try {
                const element = this.page.locator(selector).first();
                const isVisible = await element.isVisible({ timeout: 500 }).catch(() => false);

                if (isVisible) {
                    signal.detected = true;
                    console.log(`📢 Detected: ${pattern.name}`);

                    // Human notices the popup (reading time)
                    await new Promise(r => setTimeout(r, this.timing.getThinkingPause('simple')));

                    // Try to accept or dismiss
                    const success = await this.tryInteraction(pattern);
                    signal.handled = success;

                    if (success) {
                        console.log(`✅ Handled: ${pattern.name}`);
                    }

                    break;
                }
            } catch {
                // Selector not found, continue
            }
        }

        return signal;
    }

    /**
     * Attempt to interact with signal (accept or dismiss)
     */
    private async tryInteraction(pattern: SignalPattern): Promise<boolean> {
        // First try accept selectors
        for (const selector of pattern.acceptSelectors) {
            try {
                const button = this.page.locator(selector).first();
                const isVisible = await button.isVisible({ timeout: 500 }).catch(() => false);

                if (isVisible) {
                    await this.behavior.naturalClick(button, { hesitate: true, important: false });

                    // Wait for UI to update
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
                    return true;
                }
            } catch {
                continue;
            }
        }

        // Then try dismiss selectors
        for (const selector of pattern.dismissSelectors) {
            try {
                const button = this.page.locator(selector).first();
                const isVisible = await button.isVisible({ timeout: 500 }).catch(() => false);

                if (isVisible) {
                    await this.behavior.naturalClick(button, { hesitate: true, important: false });

                    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
                    return true;
                }
            } catch {
                continue;
            }
        }

        return false;
    }

    /**
     * Handle VFS-specific cookie consent
     * Custom pattern based on VFS Global website structure
     */
    async handleVFSCookieConsent(): Promise<boolean> {
        const vfsPattern: SignalPattern = {
            type: 'cookie_consent',
            name: 'VFS Cookie Banner',
            detectSelectors: [
                '.ot-sdk-container',
                '#onetrust-banner-sdk',
                '[class*="cookie-banner"]',
                '.optanon-alert-box-wrapper',
            ],
            acceptSelectors: [
                '#onetrust-accept-btn-handler',
                'button:has-text("Accept All Cookies")',
                'button:has-text("Accept All")',
                '[class*="accept-cookies"]',
            ],
            dismissSelectors: [
                '#onetrust-reject-all-handler',
                'button:has-text("Accept Only Necessary")',
            ],
            priority: 10,
        };

        const result = await this.handlePattern(vfsPattern);
        return result.handled;
    }

    /**
     * Wait for any blocking overlays to disappear
     */
    async waitForClearScreen(timeout: number = 10000): Promise<boolean> {
        const blockingSelectors = [
            '.loading-overlay',
            '[class*="spinner"]',
            '[class*="loader"]:not([hidden])',
            '.modal-backdrop',
        ];

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            let hasBlocker = false;

            for (const selector of blockingSelectors) {
                const isVisible = await this.page.locator(selector).first()
                    .isVisible({ timeout: 100 })
                    .catch(() => false);

                if (isVisible) {
                    hasBlocker = true;
                    break;
                }
            }

            if (!hasBlocker) return true;

            await new Promise(r => setTimeout(r, 500));
        }

        return false;
    }

    /**
     * Get history of handled signals
     */
    getHistory(): UISignal[] {
        return [...this.handledSignals];
    }
}
