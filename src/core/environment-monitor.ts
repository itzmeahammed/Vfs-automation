/**
 * Environment Monitor
 * 
 * Philosophy: "Detects and respects scheduled maintenance states, temporary service
 * unavailability, and security-driven soft blocks. Implements human-like retry
 * behavior with cooldowns. Never loops aggressively or retries instantly."
 * 
 * This module observes website state and adapts behavior accordingly,
 * treating blocks and errors as valid states that require patience.
 */

export type EnvironmentState =
    | 'healthy'           // Normal operation
    | 'maintenance'       // Scheduled maintenance
    | 'rate_limited'      // Too many requests
    | 'security_block'    // Cloudflare or similar challenge
    | 'session_expired'   // Session invalidated
    | 'service_unavailable' // Temporary outage
    | 'unknown_error';    // Unexpected state

export interface StateIndicators {
    state: EnvironmentState;
    message: string;
    retryAfter?: number;  // Suggested wait time in ms
    actionable: boolean;  // Can automation proceed?
}

interface DetectionPattern {
    state: EnvironmentState;
    patterns: RegExp[];
    selectors: string[];
    retryAfter: number;
    message: string;
}

const DETECTION_PATTERNS: DetectionPattern[] = [
    {
        state: 'session_expired',
        patterns: [
            /session\s*(has\s*)?expired/i,
            /please\s*try\s*again\s*in\s*one\s*hour/i,
            /session\s*invalid/i,
            /login\s*again/i,
        ],
        selectors: [
            '[class*="session-expired"]',
            '[class*="error-page"]',
        ],
        retryAfter: 60 * 60 * 1000, // 1 hour
        message: 'Session expired. Waiting before retry.',
    },
    {
        state: 'security_block',
        patterns: [
            /checking\s*(your\s*)?browser/i,
            /security\s*check/i,
            /just\s*a\s*moment/i,
            /verifying\s*(you\s*are\s*)?human/i,
            /enable\s*javascript/i,
            /attention\s*required/i,
            /blocked/i,
        ],
        selectors: [
            '#cf-challenge-running',
            '.cf-browser-verification',
            '[class*="turnstile"]',
            '#challenge-running',
        ],
        retryAfter: 10 * 60 * 1000, // 10 minutes
        message: 'Security verification in progress.',
    },
    {
        state: 'maintenance',
        patterns: [
            /maintenance/i,
            /temporarily\s*unavailable/i,
            /scheduled\s*downtime/i,
            /we('re|\s*are)\s*updating/i,
        ],
        selectors: [
            '[class*="maintenance"]',
            '[class*="downtime"]',
        ],
        retryAfter: 30 * 60 * 1000, // 30 minutes
        message: 'Site is under maintenance.',
    },
    {
        state: 'rate_limited',
        patterns: [
            /too\s*many\s*requests/i,
            /rate\s*limit/i,
            /slow\s*down/i,
            /going\s*too\s*fast/i,
            /try\s*again\s*later/i,
        ],
        selectors: [
            '[class*="rate-limit"]',
            '[class*="too-many"]',
        ],
        retryAfter: 5 * 60 * 1000, // 5 minutes
        message: 'Rate limited. Implementing cooldown.',
    },
    {
        state: 'service_unavailable',
        patterns: [
            /503\s*service/i,
            /502\s*bad/i,
            /server\s*error/i,
            /something\s*went\s*wrong/i,
            /internal\s*error/i,
        ],
        selectors: [
            '[class*="error-500"]',
            '[class*="server-error"]',
        ],
        retryAfter: 2 * 60 * 1000, // 2 minutes
        message: 'Service temporarily unavailable.',
    },
];

export class EnvironmentMonitor {
    private lastCheck: Date = new Date();
    private consecutiveErrors: number = 0;
    private maxConsecutiveErrors: number = 5;

    /**
     * Analyze page content to detect environment state
     */
    async detectState(options: {
        pageTitle?: string;
        pageUrl?: string;
        pageContent?: string;
        visibleSelectors?: string[];
    }): Promise<StateIndicators> {
        const { pageTitle = '', pageUrl = '', pageContent = '', visibleSelectors = [] } = options;
        const combinedText = `${pageTitle} ${pageUrl} ${pageContent}`;

        // Check each detection pattern
        for (const pattern of DETECTION_PATTERNS) {
            // Check text patterns
            for (const regex of pattern.patterns) {
                if (regex.test(combinedText)) {
                    this.consecutiveErrors++;
                    return {
                        state: pattern.state,
                        message: pattern.message,
                        retryAfter: this.calculateRetryDelay(pattern.retryAfter),
                        actionable: false,
                    };
                }
            }

            // Check selector patterns
            for (const selector of pattern.selectors) {
                if (visibleSelectors.includes(selector)) {
                    this.consecutiveErrors++;
                    return {
                        state: pattern.state,
                        message: pattern.message,
                        retryAfter: this.calculateRetryDelay(pattern.retryAfter),
                        actionable: false,
                    };
                }
            }
        }

        // No issues detected
        this.consecutiveErrors = 0;
        this.lastCheck = new Date();

        return {
            state: 'healthy',
            message: 'Environment appears healthy.',
            actionable: true,
        };
    }

    /**
     * Calculate retry delay with exponential backoff
     * Humans naturally wait longer after repeated failures
     */
    private calculateRetryDelay(baseDelay: number): number {
        // Exponential backoff with jitter
        const backoffMultiplier = Math.pow(1.5, this.consecutiveErrors);
        const jitter = 0.8 + Math.random() * 0.4; // 80-120% of base

        return Math.min(
            baseDelay * backoffMultiplier * jitter,
            60 * 60 * 1000 // Max 1 hour
        );
    }

    /**
     * Check if we should continue after current state
     */
    shouldProceed(): boolean {
        return this.consecutiveErrors < this.maxConsecutiveErrors;
    }

    /**
     * Get human-readable status
     */
    getStatus(): string {
        if (this.consecutiveErrors === 0) {
            return '✅ Environment healthy';
        }
        return `⚠️ ${this.consecutiveErrors} consecutive issue(s) detected`;
    }

    /**
     * Reset error counter (after successful action)
     */
    reset(): void {
        this.consecutiveErrors = 0;
    }

    /**
     * Format wait time for human display
     */
    static formatWaitTime(ms: number): string {
        if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
        if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
        return `${(ms / 3600000).toFixed(1)} hours`;
    }
}
