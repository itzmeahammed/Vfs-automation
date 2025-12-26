/**
 * Human Timing Engine
 * 
 * Philosophy: "Actions occur only after visual readiness, not DOM availability alone.
 * No instantaneous reactions to page load or UI changes."
 * 
 * This module generates non-deterministic, human-like timing patterns
 * that vary naturally based on context and action type.
 */

export interface TimingConfig {
    minTypingDelay: number;
    maxTypingDelay: number;
    minActionDelay: number;
    maxActionDelay: number;
    thinkingPause: { min: number; max: number };
    readingSpeed: number; // words per minute
}

const DEFAULT_CONFIG: TimingConfig = {
    minTypingDelay: 35,          // Reduced from 45
    maxTypingDelay: 120,         // Reduced from 180
    minActionDelay: 300,         // Reduced from 600
    maxActionDelay: 1200,        // Reduced from 2800
    thinkingPause: { min: 500, max: 2000 },  // Reduced from 1200-4500
    readingSpeed: 250, // Faster reading (was 200 WPM)
};

/**
 * Gaussian distribution for more natural randomness
 * Human behavior follows normal distribution, not uniform random
 */
function gaussianRandom(mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export class HumanTimingEngine {
    private config: TimingConfig;
    private fatigueLevel: number = 0; // 0-1, increases over time
    private sessionStartTime: number;
    private lastActionTime: number;

    constructor(config: Partial<TimingConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.sessionStartTime = Date.now();
        this.lastActionTime = Date.now();
    }

    /**
     * Get delay for typing a single character
     * Humans type faster in the middle of familiar words, slower at word boundaries
     */
    getTypingDelay(char: string, previousChar: string = ''): number {
        const { minTypingDelay, maxTypingDelay } = this.config;
        const mean = (minTypingDelay + maxTypingDelay) / 2;
        const stdDev = (maxTypingDelay - minTypingDelay) / 4;

        let baseDelay = gaussianRandom(mean, stdDev);

        // Word boundaries (space, punctuation) take longer
        if (char === ' ' || /[.,!?;:]/.test(char)) {
            baseDelay *= 1.3 + Math.random() * 0.4;
        }

        // Capital letters after space (new sentence) take longer
        if (previousChar === ' ' && /[A-Z]/.test(char)) {
            baseDelay *= 1.2;
        }

        // Numbers require looking at keyboard
        if (/\d/.test(char)) {
            baseDelay *= 1.4 + Math.random() * 0.3;
        }

        // Special characters are slowest
        if (/[!@#$%^&*()_+=\[\]{}|\\:";'<>?,./`~]/.test(char)) {
            baseDelay *= 1.5 + Math.random() * 0.5;
        }

        // Apply fatigue (people slow down over time)
        baseDelay *= 1 + this.fatigueLevel * 0.3;

        return clamp(Math.round(baseDelay), minTypingDelay, maxTypingDelay * 2);
    }

    /**
     * Get delay between major actions (click, navigate, submit)
     * Represents human decision-making time
     */
    getActionDelay(actionType: 'click' | 'navigate' | 'submit' | 'scroll' | 'focus' = 'click'): number {
        const { minActionDelay, maxActionDelay } = this.config;
        const mean = (minActionDelay + maxActionDelay) / 2;
        const stdDev = (maxActionDelay - minActionDelay) / 4;

        let baseDelay = gaussianRandom(mean, stdDev);

        // Different actions have different cognitive loads
        const multipliers: Record<string, number> = {
            focus: 0.6,      // Quick glance
            scroll: 0.7,     // Natural flow
            click: 1.0,      // Standard action
            navigate: 1.4,   // Waiting/anticipating
            submit: 1.8,     // Double-checking before submit
        };

        baseDelay *= multipliers[actionType] || 1.0;

        // Apply fatigue
        baseDelay *= 1 + this.fatigueLevel * 0.4;

        this.updateFatigue();
        this.lastActionTime = Date.now();

        return clamp(Math.round(baseDelay), minActionDelay * 0.5, maxActionDelay * 3);
    }

    /**
     * Simulate thinking/reading pause
     * Used before important decisions or after seeing new content
     */
    getThinkingPause(contentComplexity: 'simple' | 'moderate' | 'complex' = 'moderate'): number {
        const { thinkingPause } = this.config;
        const mean = (thinkingPause.min + thinkingPause.max) / 2;
        const stdDev = (thinkingPause.max - thinkingPause.min) / 4;

        let baseDelay = gaussianRandom(mean, stdDev);

        const multipliers = {
            simple: 0.6,
            moderate: 1.0,
            complex: 1.8,
        };

        baseDelay *= multipliers[contentComplexity];
        baseDelay *= 1 + this.fatigueLevel * 0.5;

        return clamp(Math.round(baseDelay), thinkingPause.min, thinkingPause.max * 2);
    }

    /**
     * Calculate reading time for text content
     * Humans scan content at roughly consistent speeds
     */
    getReadingTime(text: string): number {
        const wordCount = text.split(/\s+/).length;
        const baseMinutes = wordCount / this.config.readingSpeed;
        const baseMs = baseMinutes * 60 * 1000;

        // Add variance (±20%)
        const variance = 0.8 + Math.random() * 0.4;

        return Math.round(baseMs * variance);
    }

    /**
     * Get multiple keystrokes delays for a full string
     * Returns array of delays between each character
     */
    /**
     * Get multiple keystrokes delays for a full string
     * Returns array of delays between each character
     */
    getTypingSequence(text: string): number[] {
        const actions = this.getTypingActions(text);
        return actions.filter(a => a.type === 'type').map(a => a.delay);
    }

    /**
     * Generate a sequence of typing actions including possible mistakes and corrections
     */
    getTypingActions(text: string, mistakeProb: number = 0.08): { type: 'type' | 'backspace' | 'pause', char?: string, delay: number }[] {
        const actions: { type: 'type' | 'backspace' | 'pause', char?: string, delay: number }[] = [];
        let previousChar = '';

        // Keyboard adjacency map (simplified for common mistakes)
        const adjacents: Record<string, string> = {
            'a': 's', 's': 'a', 'd': 's', 'f': 'd',
            'm': 'n', 'n': 'm', 'o': 'p', 'p': 'o',
            'l': 'k', 'k': 'l', 'i': 'o', 'u': 'i',
        };

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Check for mistake opportunity
            if (Math.random() < mistakeProb && adjacents[char.toLowerCase()]) {
                const wrongChar = adjacents[char.toLowerCase()];
                // Type wrong char
                actions.push({
                    type: 'type',
                    char: wrongChar,
                    delay: this.getTypingDelay(wrongChar, previousChar)
                });

                // Realize mistake (pause)
                actions.push({
                    type: 'pause',
                    delay: this.getThinkingPause('simple') * 0.5
                });

                // Backspace
                actions.push({
                    type: 'backspace',
                    delay: this.getTypingDelay('Backspace', wrongChar)
                });

                previousChar = ''; // Reset context slightly
            }

            // Type correct char
            const delay = this.getTypingDelay(char, previousChar);
            actions.push({ type: 'type', char, delay });
            previousChar = char;
        }

        return actions;
    }

    /**
     * Pre-action hesitation (before clicking something important)
     */
    getHesitationDelay(isImportantAction: boolean = false): number {
        const base = isImportantAction ?
            gaussianRandom(800, 300) :
            gaussianRandom(200, 100);

        return clamp(Math.round(base), 50, 2000);
    }

    /**
     * Update fatigue based on session duration
     */
    private updateFatigue(): void {
        const sessionDuration = Date.now() - this.sessionStartTime;
        const hourInMs = 60 * 60 * 1000;

        // Fatigue increases logarithmically, max at ~0.5 after 2 hours
        this.fatigueLevel = Math.min(
            0.5,
            Math.log(1 + sessionDuration / hourInMs) * 0.2
        );
    }

    /**
     * Reset session (new "user session" started)
     */
    resetSession(): void {
        this.sessionStartTime = Date.now();
        this.lastActionTime = Date.now();
        this.fatigueLevel = 0;
    }

    /**
     * Promise-based sleep with human timing
     */
    async humanDelay(type: 'typing' | 'action' | 'thinking' | 'reading', context?: string): Promise<void> {
        let delay: number;

        switch (type) {
            case 'typing':
                delay = this.getTypingDelay(context || '', '');
                break;
            case 'action':
                delay = this.getActionDelay('click');
                break;
            case 'thinking':
                delay = this.getThinkingPause('moderate');
                break;
            case 'reading':
                delay = this.getReadingTime(context || '');
                break;
            default:
                delay = this.getActionDelay();
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

export const timing = new HumanTimingEngine();
