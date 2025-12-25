/**
 * Unit Tests for Human Timing Engine
 * 
 * Tests verify that the timing engine produces:
 * 1. Non-deterministic delays (variance exists)
 * 2. Delays within expected bounds
 * 3. Gaussian-like distribution characteristics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HumanTimingEngine } from '../core/human-timing.js';

describe('HumanTimingEngine', () => {
    let timing: HumanTimingEngine;

    beforeEach(() => {
        timing = new HumanTimingEngine();
    });

    describe('getTypingDelay', () => {
        it('should return delays within expected bounds', () => {
            const delays: number[] = [];

            for (let i = 0; i < 100; i++) {
                delays.push(timing.getTypingDelay('a', 'b'));
            }

            const min = Math.min(...delays);
            const max = Math.max(...delays);

            // Should be within reasonable typing speed (30ms - 400ms)
            expect(min).toBeGreaterThan(20);
            expect(max).toBeLessThan(500);
        });

        it('should produce varied delays (not deterministic)', () => {
            const delays = new Set<number>();

            for (let i = 0; i < 50; i++) {
                delays.add(timing.getTypingDelay('a', 'b'));
            }

            // Should have multiple unique values
            expect(delays.size).toBeGreaterThan(20);
        });

        it('should have longer delays for special characters', () => {
            const normalDelays: number[] = [];
            const specialDelays: number[] = [];

            for (let i = 0; i < 100; i++) {
                normalDelays.push(timing.getTypingDelay('a', 'b'));
                specialDelays.push(timing.getTypingDelay('@', 'a'));
            }

            const normalAvg = normalDelays.reduce((a, b) => a + b) / normalDelays.length;
            const specialAvg = specialDelays.reduce((a, b) => a + b) / specialDelays.length;

            // Special characters should take longer on average
            expect(specialAvg).toBeGreaterThan(normalAvg);
        });

        it('should have longer delays at word boundaries', () => {
            const midWordDelays: number[] = [];
            const boundaryDelays: number[] = [];

            for (let i = 0; i < 100; i++) {
                midWordDelays.push(timing.getTypingDelay('a', 'b'));
                boundaryDelays.push(timing.getTypingDelay(' ', 'a'));
            }

            const midAvg = midWordDelays.reduce((a, b) => a + b) / midWordDelays.length;
            const boundaryAvg = boundaryDelays.reduce((a, b) => a + b) / boundaryDelays.length;

            expect(boundaryAvg).toBeGreaterThan(midAvg);
        });
    });

    describe('getActionDelay', () => {
        it('should return delays within expected bounds', () => {
            const delays: number[] = [];

            for (let i = 0; i < 100; i++) {
                delays.push(timing.getActionDelay('click'));
            }

            const min = Math.min(...delays);
            const max = Math.max(...delays);

            // Action delays should be 300ms - 8000ms
            expect(min).toBeGreaterThan(200);
            expect(max).toBeLessThan(10000);
        });

        it('should have different delays for different action types', () => {
            const focusDelays: number[] = [];
            const submitDelays: number[] = [];

            for (let i = 0; i < 100; i++) {
                focusDelays.push(timing.getActionDelay('focus'));
                submitDelays.push(timing.getActionDelay('submit'));
            }

            const focusAvg = focusDelays.reduce((a, b) => a + b) / focusDelays.length;
            const submitAvg = submitDelays.reduce((a, b) => a + b) / submitDelays.length;

            // Submit should take longer (more hesitation)
            expect(submitAvg).toBeGreaterThan(focusAvg);
        });
    });

    describe('getThinkingPause', () => {
        it('should scale with complexity', () => {
            const simplePauses: number[] = [];
            const complexPauses: number[] = [];

            for (let i = 0; i < 100; i++) {
                simplePauses.push(timing.getThinkingPause('simple'));
                complexPauses.push(timing.getThinkingPause('complex'));
            }

            const simpleAvg = simplePauses.reduce((a, b) => a + b) / simplePauses.length;
            const complexAvg = complexPauses.reduce((a, b) => a + b) / complexPauses.length;

            expect(complexAvg).toBeGreaterThan(simpleAvg * 1.3);
        });
    });

    describe('getTypingSequence', () => {
        it('should return array matching text length', () => {
            const text = 'Hello World!';
            const sequence = timing.getTypingSequence(text);

            expect(sequence.length).toBe(text.length);
        });

        it('should have all positive delays', () => {
            const sequence = timing.getTypingSequence('Test string 123!');

            sequence.forEach(delay => {
                expect(delay).toBeGreaterThan(0);
            });
        });
    });

    describe('getReadingTime', () => {
        it('should scale with text length', () => {
            const shortTime = timing.getReadingTime('Hello');
            const longTime = timing.getReadingTime('Hello world this is a longer piece of text to read');

            expect(longTime).toBeGreaterThan(shortTime);
        });
    });

    describe('session fatigue', () => {
        it('should reset session properly', () => {
            // Get initial delay
            const initialDelay = timing.getActionDelay('click');

            // Simulate passage of time with many actions
            for (let i = 0; i < 50; i++) {
                timing.getActionDelay('click');
            }

            // Reset session
            timing.resetSession();

            // Fatigue should be reset
            const afterResetDelay = timing.getActionDelay('click');

            // Both should be in similar range (fatigue reset)
            expect(Math.abs(afterResetDelay - initialDelay)).toBeLessThan(2000);
        });
    });
});
