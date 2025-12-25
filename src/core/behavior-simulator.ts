/**
 * Behavior Simulator
 * 
 * Philosophy: "Interactions occur through natural user flows:
 * Focus before input, mouse movement before clicks, typing with variable cadence.
 * No direct DOM injection or forced event triggering. The page is 'used', not 'controlled'."
 * 
 * This module generates human-like interaction patterns using Playwright's
 * native interaction methods, enhanced with realistic motion curves and timing.
 */

import { Page, ElementHandle, Mouse, Keyboard, Locator } from 'playwright';
import { HumanTimingEngine } from './human-timing.js';

interface Point {
    x: number;
    y: number;
}

interface BezierCurve {
    start: Point;
    control1: Point;
    control2: Point;
    end: Point;
}

/**
 * Generate a Bezier curve for natural mouse movement
 * Human mouse movements follow curved paths, not straight lines
 */
function generateBezierPath(start: Point, end: Point): BezierCurve {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control points create natural curve
    // Perpendicular offset creates human-like arc
    const perpX = -dy / distance;
    const perpY = dx / distance;

    const curvature = (Math.random() - 0.5) * distance * 0.3;
    const offset1 = 0.3 + Math.random() * 0.2;
    const offset2 = 0.6 + Math.random() * 0.2;

    return {
        start,
        control1: {
            x: start.x + dx * offset1 + perpX * curvature,
            y: start.y + dy * offset1 + perpY * curvature,
        },
        control2: {
            x: start.x + dx * offset2 + perpX * curvature * 0.5,
            y: start.y + dy * offset2 + perpY * curvature * 0.5,
        },
        end,
    };
}

/**
 * Calculate point on Bezier curve at parameter t (0-1)
 */
function bezierPoint(curve: BezierCurve, t: number): Point {
    const { start, control1, control2, end } = curve;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
        x: mt3 * start.x + 3 * mt2 * t * control1.x + 3 * mt * t2 * control2.x + t3 * end.x,
        y: mt3 * start.y + 3 * mt2 * t * control1.y + 3 * mt * t2 * control2.y + t3 * end.y,
    };
}

/**
 * Generate motion path with non-uniform speed (ease-in-out)
 * Humans accelerate at start, decelerate near target
 */
function generateMotionPath(start: Point, end: Point, steps: number = 25): Point[] {
    const curve = generateBezierPath(start, end);
    const points: Point[] = [];

    for (let i = 0; i <= steps; i++) {
        // Ease-in-out timing function
        let t = i / steps;
        t = t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const point = bezierPoint(curve, t);

        // Add slight tremor (natural hand movement)
        const tremor = 1.5;
        point.x += (Math.random() - 0.5) * tremor;
        point.y += (Math.random() - 0.5) * tremor;

        points.push(point);
    }

    return points;
}

export class BehaviorSimulator {
    private page: Page;
    private timing: HumanTimingEngine;
    private currentMousePosition: Point = { x: 0, y: 0 };
    private viewportSize: { width: number; height: number } = { width: 1920, height: 1080 };

    constructor(page: Page, timing?: HumanTimingEngine) {
        this.page = page;
        this.timing = timing || new HumanTimingEngine();
        this.initializeViewport();
    }

    private async initializeViewport(): Promise<void> {
        const viewport = this.page.viewportSize();
        if (viewport) {
            this.viewportSize = viewport;
        }
        // Start mouse at a natural position (not 0,0)
        this.currentMousePosition = {
            x: this.viewportSize.width * 0.3 + Math.random() * 100,
            y: this.viewportSize.height * 0.4 + Math.random() * 100,
        };
    }

    /**
     * Move mouse along natural curved path to target
     */
    async moveMouseTo(target: Point): Promise<void> {
        const path = generateMotionPath(this.currentMousePosition, target);

        for (const point of path) {
            await this.page.mouse.move(point.x, point.y);
            // Variable micro-delays between movements
            await new Promise(r => setTimeout(r, 8 + Math.random() * 15));
        }

        this.currentMousePosition = target;
    }

    /**
     * Get element's center point with slight randomization
     * Humans don't click dead center every time
     */
    async getClickablePoint(element: Locator | ElementHandle): Promise<Point> {
        const box = await element.boundingBox();
        if (!box) throw new Error('Element not visible');

        // Click within inner 60% of element (not edges)
        const margin = 0.2;
        const innerWidth = box.width * (1 - margin * 2);
        const innerHeight = box.height * (1 - margin * 2);

        return {
            x: box.x + margin * box.width + Math.random() * innerWidth,
            y: box.y + margin * box.height + Math.random() * innerHeight,
        };
    }

    /**
     * Natural click: move to element, slight pause, then click
     */
    async naturalClick(element: Locator | ElementHandle, options?: {
        hesitate?: boolean;
        important?: boolean;
    }): Promise<void> {
        const target = await this.getClickablePoint(element);

        // Move mouse naturally
        await this.moveMouseTo(target);

        // Pre-click hesitation
        if (options?.hesitate !== false) {
            const hesitation = this.timing.getHesitationDelay(options?.important || false);
            await new Promise(r => setTimeout(r, hesitation));
        }

        // Actual click with slight delay variations
        const clickDuration = 50 + Math.random() * 80;
        await this.page.mouse.down();
        await new Promise(r => setTimeout(r, clickDuration));
        await this.page.mouse.up();

        // Post-click pause (viewing result)
        await new Promise(r => setTimeout(r, this.timing.getActionDelay('click') * 0.3));
    }

    /**
     * Robustly fill an input field by clicking multiple times to ensure focus
     * Useful for finicky fields that require distinct activation
     * 
     * Enhanced: Now verifies focus before typing and confirms content was entered
     */
    async robustFill(
        element: Locator | ElementHandle,
        text: string,
        description?: string
    ): Promise<void> {
        const fieldName = description || 'field';
        console.log(`      ⌨️ Robustly filling ${fieldName} (length: ${text.length})...`);

        // Helper to check if element is focused
        const isFocused = async (): Promise<boolean> => {
            try {
                if ('evaluate' in element) {
                    // It's a Locator
                    return await (element as Locator).evaluate((el) => {
                        return document.activeElement === el;
                    });
                } else {
                    // It's an ElementHandle
                    return await (element as ElementHandle).evaluate((el) => {
                        return document.activeElement === el;
                    });
                }
            } catch {
                return false;
            }
        };

        // Helper to get input value
        const getInputValue = async (): Promise<string> => {
            try {
                if ('evaluate' in element) {
                    return await (element as Locator).evaluate((el) => {
                        return (el as HTMLInputElement).value || '';
                    });
                } else {
                    return await (element as ElementHandle).evaluate((el) => {
                        return (el as HTMLInputElement).value || '';
                    });
                }
            } catch {
                return '';
            }
        };

        // Try to focus with multiple attempts
        let focused = false;
        const maxFocusAttempts = 5;

        for (let attempt = 1; attempt <= maxFocusAttempts; attempt++) {
            console.log(`         📍 Focus attempt ${attempt}/${maxFocusAttempts}...`);

            // Click to focus
            await this.naturalClick(element, { hesitate: false });

            // Wait for focus to register
            await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

            // Check if focused
            focused = await isFocused();

            if (focused) {
                console.log(`         ✅ Field focused on attempt ${attempt}`);
                break;
            }

            // If not focused, try alternative focus methods
            if (attempt === 2) {
                // Try double-click
                console.log(`         🔄 Trying double-click...`);
                try {
                    if ('dblclick' in element) {
                        await (element as Locator).dblclick();
                    }
                } catch {
                    // Fallback to two clicks
                    await this.naturalClick(element, { hesitate: false });
                    await new Promise(r => setTimeout(r, 50));
                    await this.naturalClick(element, { hesitate: false });
                }
            } else if (attempt === 3) {
                // Try Playwright's focus method
                console.log(`         🔄 Trying .focus()...`);
                try {
                    if ('focus' in element) {
                        await (element as Locator).focus();
                    }
                } catch { /* ignore */ }
            } else if (attempt >= 4) {
                // Triple click as last resort
                console.log(`         🔄 Triple-clicking as fallback...`);
                await this.naturalClick(element, { hesitate: false });
                await new Promise(r => setTimeout(r, 100));
                await this.naturalClick(element, { hesitate: false });
                await new Promise(r => setTimeout(r, 100));
                await this.naturalClick(element, { hesitate: false });
            }

            // Wait longer between attempts
            await new Promise(r => setTimeout(r, 500));
        }

        // Warn if focus couldn't be verified (but continue anyway - some sites have weird focus behavior)
        if (!focused) {
            console.log(`         ⚠️ Could not verify focus - proceeding anyway...`);
        }

        // Extra wait to let UI fully settle
        await new Promise(r => setTimeout(r, this.timing.getActionDelay('focus')));

        // Clear existing content safely
        await this.page.keyboard.press('Control+a');
        await new Promise(r => setTimeout(r, 100));
        await this.page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 150));

        // Type the content with human-like timing
        const actions = this.timing.getTypingActions(text, 0.08);

        for (const action of actions) {
            if (action.type === 'type' && action.char) {
                await this.page.keyboard.type(action.char);
            } else if (action.type === 'backspace') {
                await this.page.keyboard.press('Backspace');
            }

            // Wait for the calculated delay
            await new Promise(r => setTimeout(r, action.delay));
        }

        // Brief pause
        await new Promise(r => setTimeout(r, 200));

        // Verify content was entered
        const enteredValue = await getInputValue();
        if (enteredValue.length === 0 && text.length > 0) {
            console.log(`         ⚠️ Field appears empty! Retrying with direct input...`);

            // Fallback: Use Playwright's fill method
            try {
                if ('fill' in element) {
                    await (element as Locator).click(); // One more click
                    await new Promise(r => setTimeout(r, 300));
                    await (element as Locator).fill(text);
                    console.log(`         ✅ Used fallback fill method`);
                }
            } catch (e) {
                console.log(`         ❌ Fallback fill also failed: ${e}`);
            }
        } else if (enteredValue.length > 0) {
            console.log(`         ✅ Content entered (${enteredValue.length} chars)`);
        }

        // Brief review pause
        await new Promise(r => setTimeout(r, this.timing.getThinkingPause('simple') * 0.5));
    }

    /**
     * Type text with human-like cadence
     * Includes natural variations, brief pauses, and occasional hesitations
     */
    /**
     * Type text with human-like cadence
     * Includes natural variations, brief pauses, and occasional hesitations
     */
    async naturalType(
        element: Locator | ElementHandle,
        text: string,
        options?: { clearFirst?: boolean; mistakeProb?: number }
    ): Promise<void> {
        // First, click to focus the element
        await this.naturalClick(element, { hesitate: true });

        // Brief pause after focus
        await new Promise(r => setTimeout(r, this.timing.getActionDelay('focus')));

        // Clear existing content if requested
        if (options?.clearFirst) {
            await this.page.keyboard.press('Control+a');
            await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
            await this.page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
        }

        // Get timing sequence for this text (including mistakes)
        const actions = this.timing.getTypingActions(text, options?.mistakeProb ?? 0.08);

        // Execute each action
        for (const action of actions) {
            if (action.type === 'type' && action.char) {
                await this.page.keyboard.type(action.char);
            } else if (action.type === 'backspace') {
                await this.page.keyboard.press('Backspace');
            }

            // Wait for the calculated delay
            await new Promise(r => setTimeout(r, action.delay));
        }

        // Brief pause after completing input (reviewing what was typed)
        await new Promise(r => setTimeout(r, this.timing.getThinkingPause('simple') * 0.5));
    }

    /**
     * Scroll page naturally (variable speed, occasional pauses)
     */
    async naturalScroll(
        direction: 'up' | 'down',
        amount: 'small' | 'medium' | 'large' | number
    ): Promise<void> {
        const scrollAmounts = {
            small: 150 + Math.random() * 100,
            medium: 350 + Math.random() * 150,
            large: 600 + Math.random() * 200,
        };

        const distance = typeof amount === 'number' ? amount : scrollAmounts[amount];
        const steps = Math.ceil(distance / 100);
        const stepSize = distance / steps;

        for (let i = 0; i < steps; i++) {
            const scrollDelta = direction === 'down' ? stepSize : -stepSize;
            await this.page.mouse.wheel(0, scrollDelta);

            // Variable delay between scroll steps
            await new Promise(r => setTimeout(r, 30 + Math.random() * 50));
        }

        // Reading/viewing pause after scroll
        await new Promise(r => setTimeout(r, this.timing.getActionDelay('scroll')));
    }

    /**
     * Wait for element with human-like patience
     * Humans don't instantly react when something appears
     */
    async waitAndReact(
        selector: string,
        options?: {
            timeout?: number;
            reactDelay?: 'natural' | 'quick' | 'slow';
        }
    ): Promise<Locator> {
        const locator = this.page.locator(selector);

        await locator.waitFor({
            state: 'visible',
            timeout: options?.timeout || 30000
        });

        // Human reaction time
        const reactDelays = {
            quick: 200 + Math.random() * 300,
            natural: 500 + Math.random() * 500,
            slow: 1000 + Math.random() * 1000,
        };

        const delay = reactDelays[options?.reactDelay || 'natural'];
        await new Promise(r => setTimeout(r, delay));

        return locator;
    }

    /**
     * Handle popup/modal (like cookie consent) naturally
     */
    async handlePopup(options: {
        detectSelector: string;
        actionSelector: string;
        waitBefore?: number;
        description?: string;
    }): Promise<boolean> {
        try {
            // Check if popup is visible
            const popup = this.page.locator(options.detectSelector);
            const isVisible = await popup.isVisible().catch(() => false);

            if (!isVisible) return false;

            // Human notices the popup (reading time)
            console.log(`📋 Noticed: ${options.description || 'popup'}`);
            await new Promise(r => setTimeout(r,
                options.waitBefore || this.timing.getThinkingPause('simple')
            ));

            // Find and click the action button
            const actionButton = this.page.locator(options.actionSelector);
            await this.naturalClick(actionButton, { hesitate: true, important: false });

            // Wait for popup to dismiss
            await popup.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Perform a natural form submission flow
     */
    async submitForm(submitButton: Locator | ElementHandle): Promise<void> {
        // Pre-submit review (humans double-check before submitting)
        console.log('👀 Reviewing form before submission...');
        await new Promise(r => setTimeout(r, this.timing.getThinkingPause('complex')));

        // Move to submit button with hesitation
        await this.naturalClick(submitButton, { hesitate: true, important: true });

        // Post-submit wait (expecting response)
        await new Promise(r => setTimeout(r, this.timing.getActionDelay('submit')));
    }

    /**
     * Simulate idle behavior (looking around the page)
     */
    async idleBehavior(duration: number = 2000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < duration) {
            // Random tiny mouse movements
            const drift: Point = {
                x: this.currentMousePosition.x + (Math.random() - 0.5) * 20,
                y: this.currentMousePosition.y + (Math.random() - 0.5) * 20,
            };

            await this.page.mouse.move(drift.x, drift.y);
            this.currentMousePosition = drift;

            await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
        }
    }
}
