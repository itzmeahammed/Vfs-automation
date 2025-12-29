/**
 * Unit Tests for Environment Monitor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnvironmentMonitor } from '../core/environment-monitor.js';

describe('EnvironmentMonitor', () => {
    let monitor: EnvironmentMonitor;

    beforeEach(() => {
        monitor = new EnvironmentMonitor();
    });

    describe('detectState', () => {
        it('should detect healthy state for normal content', async () => {
            const state = await monitor.detectState({
                pageTitle: 'VFS Global - Login',
                pageUrl: 'https://visa.vfsglobal.com/are/en/ita/login',
                pageContent: 'Enter your email and password to continue',
            });

            expect(state.state).toBe('healthy');
            expect(state.actionable).toBe(true);
        });

        it('should detect session expired state', async () => {
            const state = await monitor.detectState({
                pageContent: 'Session has expired. Please try again in one hour.',
            });

            expect(state.state).toBe('session_expired');
            expect(state.actionable).toBe(false);
            expect(state.retryAfter).toBeGreaterThan(0);
        });

        it('should detect security block', async () => {
            const state = await monitor.detectState({
                pageContent: 'Checking your browser before accessing the site...',
            });

            expect(state.state).toBe('security_block');
            expect(state.actionable).toBe(false);
        });

        it('should detect maintenance state', async () => {
            const state = await monitor.detectState({
                pageContent: 'The site is currently under maintenance.',
            });

            expect(state.state).toBe('maintenance');
            expect(state.actionable).toBe(false);
        });

        it('should detect rate limiting', async () => {
            const state = await monitor.detectState({
                pageContent: 'Too many requests. Please slow down.',
            });

            expect(state.state).toBe('rate_limited');
            expect(state.actionable).toBe(false);
        });

        it('should detect service unavailable', async () => {
            const state = await monitor.detectState({
                pageContent: '503 Service Unavailable',
            });

            expect(state.state).toBe('service_unavailable');
            expect(state.actionable).toBe(false);
        });
    });

    describe('exponential backoff', () => {
        it('should increase retry delay with consecutive errors', async () => {
            // First error
            const state1 = await monitor.detectState({
                pageContent: 'Session expired',
            });

            // Second error
            const state2 = await monitor.detectState({
                pageContent: 'Session expired',
            });

            // Third error
            const state3 = await monitor.detectState({
                pageContent: 'Session expired',
            });

            // Later retries should have longer delays (exponential backoff)
            expect(state2.retryAfter!).toBeGreaterThan(state1.retryAfter!);
            expect(state3.retryAfter!).toBeGreaterThan(state2.retryAfter!);
        });

        it('should reset consecutive errors on healthy state', async () => {
            // Trigger errors
            await monitor.detectState({ pageContent: 'Session expired' });
            await monitor.detectState({ pageContent: 'Session expired' });

            // Healthy state
            await monitor.detectState({ pageContent: 'Welcome to VFS' });

            // Next error should have base retry time
            const freshError = await monitor.detectState({ pageContent: 'Session expired' });

            // Should be back to base delay (around 1 hour for session expired)
            expect(freshError.retryAfter!).toBeLessThan(2 * 60 * 60 * 1000);
        });
    });

    describe('shouldProceed', () => {
        it('should return true initially', () => {
            expect(monitor.shouldProceed()).toBe(true);
        });

        it('should return false after too many consecutive errors', async () => {
            for (let i = 0; i < 6; i++) {
                await monitor.detectState({ pageContent: 'Session expired' });
            }

            expect(monitor.shouldProceed()).toBe(false);
        });
    });

    describe('formatWaitTime', () => {
        it('should format seconds correctly', () => {
            expect(EnvironmentMonitor.formatWaitTime(30000)).toBe('30 seconds');
        });

        it('should format minutes correctly', () => {
            expect(EnvironmentMonitor.formatWaitTime(120000)).toBe('2 minutes');
        });

        it('should format hours correctly', () => {
            expect(EnvironmentMonitor.formatWaitTime(5400000)).toBe('1.5 hours');
        });
    });
});
