/**
 * Centralized Timing Configuration
 * 
 * All wait times are defined here for easy tuning.
 * 
 * MODES:
 * - SAFE: Maximum safety, longer waits
 * - BALANCED: Good balance of speed and safety
 * - FAST: Faster but still maintains human-like behavior
 */

export type TimingMode = 'safe' | 'balanced' | 'fast';

export interface TimingConfig {
    pageLoad: number;
    angularRender: number;
    beforeClick: number;
    afterClick: number;
    betweenActions: number;
    beforeTyping: number;
    afterTyping: number;
    betweenFields: number;
    dropdownOpen: number;
    dropdownSelect: number;
    captchaWait: number;
    afterCaptcha: number;
    retryDelay: number;
    selectorTimeout: number;
    visibilityTimeout: number;
}

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
    captchaWait: 5000,
    afterCaptcha: 2000,
    retryDelay: 1500,
    selectorTimeout: 3000,
    visibilityTimeout: 2000,
};

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
    captchaWait: 5000,
    afterCaptcha: 1500,
    retryDelay: 1000,
    selectorTimeout: 2000,
    visibilityTimeout: 1500,
};

let currentMode: TimingMode = 'balanced';

export function getTiming(): TimingConfig {
    switch (currentMode) {
        case 'safe': return { ...SAFE_TIMING };
        case 'fast': return { ...FAST_TIMING };
        case 'balanced':
        default: return { ...BALANCED_TIMING };
    }
}

export function setTimingMode(mode: TimingMode): void {
    currentMode = mode;
    console.log(`⏱️ Timing mode set to: ${mode.toUpperCase()}`);
}

export function getTimingMode(): TimingMode {
    return currentMode;
}

export async function wait(type: keyof TimingConfig): Promise<void> {
    const timing = getTiming();
    const ms = timing[type] as number;
    await new Promise(r => setTimeout(r, ms));
}

export async function waitMs(ms: number): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
}

export async function waitWithVariance(type: keyof TimingConfig, variancePercent: number = 20): Promise<void> {
    const timing = getTiming();
    const base = timing[type] as number;
    const variance = base * (variancePercent / 100);
    const ms = base + (Math.random() * variance * 2 - variance);
    await new Promise(r => setTimeout(r, Math.max(50, ms)));
}

/**
 * GLOBAL DELAY MULTIPLIER
 * Scales all delays based on timing mode
 */
export async function delay(ms: number): Promise<void> {
    const multipliers: Record<TimingMode, number> = {
        safe: 1.0,
        balanced: 0.5,
        fast: 0.33,
    };

    const multiplier = multipliers[currentMode];
    const adjustedMs = Math.max(100, Math.floor(ms * multiplier));

    await new Promise(r => setTimeout(r, adjustedMs));
}

export function getDelayMultiplier(): number {
    const multipliers: Record<TimingMode, number> = {
        safe: 1.0,
        balanced: 0.5,
        fast: 0.33,
    };
    return multipliers[currentMode];
}

export { SAFE_TIMING, BALANCED_TIMING, FAST_TIMING };
