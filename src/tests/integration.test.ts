/**
 * Integration Test Suite for VFS Login Flow
 * 
 * Tests the complete end-to-end flow with a mock browser setup.
 * These tests verify the integration between all modules.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { BrowserIdentityManager } from '../core/browser-identity.js';
import { HumanTimingEngine } from '../core/human-timing.js';
import { BehaviorSimulator } from '../core/behavior-simulator.js';
import { EnvironmentMonitor } from '../core/environment-monitor.js';

describe('Integration Tests', () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        page = await context.newPage();
    });

    afterAll(async () => {
        await browser.close();
    });

    describe('BehaviorSimulator with real page', () => {
        it('should move mouse naturally', async () => {
            await page.goto('about:blank');
            await page.setContent('<button id="test">Click Me</button>');

            const timing = new HumanTimingEngine();
            const behavior = new BehaviorSimulator(page, timing);

            // This should not throw
            const button = page.locator('#test');
            await expect(behavior.naturalClick(button)).resolves.not.toThrow();
        });

        it('should type naturally', async () => {
            await page.goto('about:blank');
            await page.setContent('<input id="test" type="text">');

            const timing = new HumanTimingEngine();
            const behavior = new BehaviorSimulator(page, timing);

            const input = page.locator('#test');
            await behavior.naturalType(input, 'Hello');

            const value = await input.inputValue();
            expect(value).toBe('Hello');
        });
    });

    describe('BrowserIdentityManager', () => {
        it('should create and load profile', async () => {
            const identity = new BrowserIdentityManager({
                profileId: 'test-profile',
                headless: true,
                persistSession: true,
                profilesDir: './test-profiles',
            });

            const { browser: b, page: p } = await identity.launch();

            const profile = identity.getProfile();
            expect(profile).not.toBeNull();
            expect(profile?.id).toBe('test-profile');
            expect(profile?.sessionCount).toBeGreaterThan(0);

            await identity.close();

            // Cleanup
            const fs = await import('fs');
            fs.rmSync('./test-profiles', { recursive: true, force: true });
        });
    });

    describe('Full module integration', () => {
        it('should work with all timing and behavior modules together', async () => {
            await page.goto('about:blank');
            await page.setContent(`
        <form>
          <input id="email" type="email" placeholder="Email">
          <input id="password" type="password" placeholder="Password">
          <button type="submit" id="login">Sign In</button>
        </form>
      `);

            const timing = new HumanTimingEngine();
            const behavior = new BehaviorSimulator(page, timing);
            const monitor = new EnvironmentMonitor();

            // Check environment
            const state = await monitor.detectState({
                pageTitle: await page.title(),
                pageContent: await page.textContent('body') || '',
            });
            expect(state.state).toBe('healthy');

            // Fill form
            const email = page.locator('#email');
            const password = page.locator('#password');

            await behavior.naturalType(email, 'test@example.com');
            await behavior.naturalType(password, 'password123');

            // Verify values
            expect(await email.inputValue()).toBe('test@example.com');
            expect(await password.inputValue()).toBe('password123');
        });
    });
});
