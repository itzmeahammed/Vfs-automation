/**
 * Centralized Timing Configuration
 * 
 * All wait times are defined here for easy tuning.
 * 
 * MODES:
 * - SAFE: Maximum safety, longer waits (current default)
 * - BALANCED: Good balance of speed and safety
 * - FAST: Faster but still maintains human-like behavior
 * 
 * NOTE: Do NOT use values below the "minimum safe" thresholds
 * to avoid bot detection.
 */

export type TimingMode = 'safe' | 'balanced' | 'fast';

export interface TimingConfig {
    // Page load and navigation waits
    pageLoad: number;           // After navigation
    angularRender: number;      // For Angular reactivity

    // Interaction waits
    beforeClick: number;        // Before clicking elements
    afterClick: number;         // After clicking elements
    betweenActions: number;     // Between sequential actions

    // Form interaction
    beforeTyping: number;       // Before starting to type
    afterTyping: number;        // After finishing typing
    betweenFields: number;      // Between form fields

    // Dropdown waits
    dropdownOpen: number;       // After clicking dropdown
    dropdownSelect: number;     // After selecting option

    // Captcha handling
    captchaWait: number;        // Wait for captcha verification (user requested 5s)
    afterCaptcha: number;       // After captcha submitted

    // Retry waits
    retryDelay: number;         // Between retry attempts

    // Selector timeouts (not waits, but timeouts)
    selectorTimeout: number;    // Timeout for finding elements
    visibilityTimeout: number;  // Timeout for visibility checks
}

/**
 * SAFE MODE: Maximum safety, current behavior
 * Total full flow: ~15-20 minutes
 */
const SAFE_TIMING: TimingConfig = {
    pageLoad: 3000,
    angularRender: 3000,
    beforeClick: 500,
    afterClick: 2000,
    betweenActions: 1500,
    beforeTyping: 300,
    afterTyping: 500,
    betweenFields: 1000,
    dropdownOpen: 2000,
    dropdownSelect: 1500,
    captchaWait: 5000,
    afterCaptcha: 3000,
    retryDelay: 2000,
    selectorTimeout: 5000,
    visibilityTimeout: 3000,
};

/**
 * BALANCED MODE: Good balance of speed and safety
 * ~40% faster than SAFE
 * Total full flow: ~8-12 minutes
 */
const BALANCED_TIMING: TimingConfig = {
    pageLoad: 2000,
    angularRender: 1500,
    beforeClick: 300,
    afterClick: 1000,
    betweenActions: 800,
    beforeTyping: 200,
    afterTyping: 300,
    betweenFields: 500,
    dropdownOpen: 1000,
    dropdownSelect: 800,
    captchaWait: 5000,      // Keep captcha wait at 5s for safety
    afterCaptcha: 2000,
    retryDelay: 1500,
    selectorTimeout: 3000,
    visibilityTimeout: 2000,
};

/**
 * FAST MODE: Faster execution, still safe
 * ~60% faster than SAFE
 * Total full flow: ~5-8 minutes
 * 
 * WARNING: May trigger more captchas
 */
const FAST_TIMING: TimingConfig = {
    pageLoad: 1500,
    angularRender: 1000,
    beforeClick: 200,
    afterClick: 600,
    betweenActions: 400,
    beforeTyping: 100,
    afterTyping: 200,
    betweenFields: 300,
    dropdownOpen: 600,
    dropdownSelect: 500,
    captchaWait: 5000,      // Keep captcha wait for safety
    afterCaptcha: 1500,
    retryDelay: 1000,
    selectorTimeout: 2000,
    visibilityTimeout: 1500,
};

/**
 * MINIMUM SAFE VALUES - Never go below these!
 * Going below will likely trigger bot detection.
 */
export const MINIMUM_SAFE: Partial<TimingConfig> = {
    beforeClick: 100,       // Need micro-delay for human-like behavior
    afterClick: 300,        // Need time for UI to respond
    beforeTyping: 50,       // Instant typing looks robotic
    betweenFields: 100,     // Need gap between fields
    captchaWait: 3000,      // Captcha needs time to verify
};

// Current active timing mode (can be changed at runtime)
let currentMode: TimingMode = 'balanced'; // DEFAULT: Balanced for reasonable speed

/**
 * Get the current timing configuration
 */
export function getTiming(): TimingConfig {
    switch (currentMode) {
        case 'safe':
            return { ...SAFE_TIMING };
        case 'fast':
            return { ...FAST_TIMING };
        case 'balanced':
        default:
            return { ...BALANCED_TIMING };
    }
}

/**
 * Set the timing mode
 */
export function setTimingMode(mode: TimingMode): void {
    currentMode = mode;
    console.log(`⏱️ Timing mode set to: ${mode.toUpperCase()}`);
}

/**
 * Get current timing mode
 */
export function getTimingMode(): TimingMode {
    return currentMode;
}

/**
 * Helper: Wait with the current timing config
 */
export async function wait(type: keyof TimingConfig): Promise<void> {
    const timing = getTiming();
    const ms = timing[type] as number;
    await new Promise(r => setTimeout(r, ms));
}

/**
 * Helper: Wait with custom ms (use sparingly)
 */
export async function waitMs(ms: number): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
}

/**
 * Helper: Add small random variance to wait (more human-like)
 */
export async function waitWithVariance(type: keyof TimingConfig, variancePercent: number = 20): Promise<void> {
    const timing = getTiming();
    const base = timing[type] as number;
    const variance = base * (variancePercent / 100);
    const ms = base + (Math.random() * variance * 2 - variance);
    await new Promise(r => setTimeout(r, Math.max(50, ms)));
}

/**
 * GLOBAL DELAY MULTIPLIER
 * 
 * This function replaces all `new Promise(r => setTimeout(r, ms))` calls.
 * It automatically scales the delay based on the current timing mode:
 * - SAFE: 1.0x (no change)
 * - BALANCED: 0.5x (50% of original time)
 * - FAST: 0.33x (33% of original time)
 * 
 * Usage: Replace `await new Promise(r => setTimeout(r, 3000))` 
 *        with `await delay(3000)`
 */
export async function delay(ms: number): Promise<void> {
    const multipliers: Record<TimingMode, number> = {
        safe: 1.0,
        balanced: 0.5,
        fast: 0.33,
    };

    const multiplier = multipliers[currentMode];
    const adjustedMs = Math.max(100, Math.floor(ms * multiplier)); // Minimum 100ms

    await new Promise(r => setTimeout(r, adjustedMs));
}

/**
 * Get current delay multiplier (for logging/debugging)
 */
export function getDelayMultiplier(): number {
    const multipliers: Record<TimingMode, number> = {
        safe: 1.0,
        balanced: 0.5,
        fast: 0.33,
    };
    return multipliers[currentMode];
}

// Export timing configs for reference
export { SAFE_TIMING, BALANCED_TIMING, FAST_TIMING };
