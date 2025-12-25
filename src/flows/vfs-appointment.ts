/**
 * VFS Global Malta - Book Appointment Flow
 * 
 * Philosophy: "Handle appointment booking with human-like behavior."
 * 
 * This module handles the /book-appointment page:
 * 1. Navigating months until finding available dates
 * 2. Selecting appointment date (td with class "date-availiable" - note VFS typo!)
 * 3. Selecting available time slot from ba-slot-table
 * 4. Clicking Continue to proceed
 */

import { Page, Locator } from 'playwright';
import * as fs from 'fs';
import {
    HumanTimingEngine,
    BehaviorSimulator,
} from '../core/index.js';

export interface AppointmentResult {
    success: boolean;
    state: 'waiting' | 'date_selected' | 'time_selected' | 'confirmed' | 'failed';
    message: string;
    appointmentDate?: string;
    appointmentTime?: string;
    screenshot?: string;
}

/**
 * VFS Malta Appointment Booking Flow
 * 
 * Handles selecting date and time on /book-appointment page
 * 
 * DOM Structure (from user's screenshots):
 * - Calendar: full-calendar with fc-daygrid-body
 * - Available dates: td.fc-daygrid-day.date-availiable (VFS uses typo "availiable")
 * - Next month button: button.fc-next-button
 * - Time slots: table.ba-slot-table with "Select" buttons
 * - Continue button: btn-brand-orange
 */
export class VFSAppointmentFlow {
    private page: Page;
    private timing: HumanTimingEngine;
    private behavior: BehaviorSimulator;
    private screenshotDir: string = './screenshots';
    private stepCounter: number = 100;

    constructor(page: Page) {
        this.page = page;
        this.timing = new HumanTimingEngine();
        this.behavior = new BehaviorSimulator(page, this.timing);
        this.ensureScreenshotDir();
    }

    private ensureScreenshotDir(): void {
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    private async takeScreenshot(description: string): Promise<string> {
        this.stepCounter++;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${this.screenshotDir}/step-${this.stepCounter}-${description}-${timestamp}.png`;

        try {
            await this.page.screenshot({ path: filename, fullPage: true });
            console.log(`   📸 Screenshot saved: ${filename}`);
            return filename;
        } catch (error) {
            console.log(`   ⚠️ Screenshot failed: ${error}`);
            return '';
        }
    }

    /**
     * Check for and handle Cloudflare captcha popup
     */
    private async checkAndHandleCaptcha(): Promise<boolean> {
        try {
            const captchaSelectors = [
                'app-cloudflare-dialog',
                '.mat-mdc-dialog-surface:has-text("Verify Captcha")',
                '.mat-mdc-dialog-surface:has-text("Success!")',
            ];

            for (const selector of captchaSelectors) {
                const dialog = this.page.locator(selector).first();
                if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
                    console.log(`\n   🤖 Captcha popup detected!`);
                    await this.takeScreenshot('captcha-detected');

                    console.log('   ⏳ Waiting 5 seconds for captcha...');
                    await new Promise(r => setTimeout(r, 5000));

                    const submitBtn = this.page.locator('button:has-text("Submit")').first();
                    if (await submitBtn.isVisible({ timeout: 2000 })) {
                        await submitBtn.click({ force: true });
                        console.log('   ✅ Clicked Submit on captcha');
                        await new Promise(r => setTimeout(r, 3000));
                        return true;
                    }
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Execute the appointment booking flow
     */
    async execute(): Promise<AppointmentResult> {
        console.log('\n' + '═'.repeat(60));
        console.log('📅 VFS Malta Appointment Booking Flow');
        console.log('═'.repeat(60) + '\n');

        try {
            // Step 1: Wait for Book Appointment page
            const pageReady = await this.waitForBookAppointmentPage();
            if (!pageReady) {
                await this.takeScreenshot('appointment-page-not-ready');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Book Appointment page not loaded',
                };
            }
            await this.takeScreenshot('appointment-page-loaded');

            // Step 2: Select appointment date (may need to navigate months)
            console.log('\n📆 Looking for available dates...');
            const dateInfo = await this.selectEarliestDate();
            await this.takeScreenshot('date-selection');

            if (!dateInfo) {
                return {
                    success: false,
                    state: 'waiting',
                    message: 'No available dates found',
                };
            }

            // Wait for time slots to appear
            await new Promise(r => setTimeout(r, 3000));

            // Step 3: Select time slot
            console.log('\n⏰ Looking for available time slots...');
            const timeInfo = await this.selectEarliestTimeSlot();
            await this.takeScreenshot('time-selection');

            if (!timeInfo) {
                return {
                    success: true,
                    state: 'date_selected',
                    message: `Date selected: ${dateInfo}, but no time slots found`,
                    appointmentDate: dateInfo,
                };
            }

            // Check for captcha
            await this.checkAndHandleCaptcha();

            // Step 4: Click Continue button
            console.log('\n➡️ Clicking Continue button...');
            const continued = await this.clickContinueButton();
            await this.takeScreenshot('after-continue');

            return {
                success: true,
                state: continued ? 'confirmed' : 'time_selected',
                message: continued
                    ? `Appointment selected: ${dateInfo} at ${timeInfo}`
                    : `Selected ${dateInfo} ${timeInfo}, but Continue pending`,
                appointmentDate: dateInfo,
                appointmentTime: timeInfo,
            };

        } catch (error) {
            console.error('❌ Appointment booking error:', error);
            await this.takeScreenshot('appointment-error');
            return {
                success: false,
                state: 'failed',
                message: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
            };
        }
    }

    /**
     * Wait for Book Appointment page to be ready
     */
    private async waitForBookAppointmentPage(): Promise<boolean> {
        console.log('📋 Checking Book Appointment page...');

        try {
            const url = this.page.url();
            console.log(`   📍 Current URL: ${url}`);

            if (!url.includes('book-appointment')) {
                console.log('   ⚠️ Not on book-appointment page');
                return false;
            }

            // Wait for calendar
            const calendarSelectors = [
                '.ba-calender-card',
                '.full-calendar',
                'full-calendar',
                '.fc-daygrid-body',
                'h2:has-text("Pick an appointment date")',
            ];

            for (const selector of calendarSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 10000 });
                    console.log(`   ✅ Found calendar element: ${selector}`);
                    await new Promise(r => setTimeout(r, 2000));
                    return true;
                } catch {
                    continue;
                }
            }

            const pageText = await this.page.textContent('body').catch(() => '');
            if (pageText?.includes('Book an Appointment') || pageText?.includes('Pick an appointment date')) {
                console.log('   ✅ Book Appointment page detected by content');
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }

            console.log('   ❌ Calendar not found');
            return false;
        } catch (error) {
            console.log('   ❌ Page not ready:', error);
            return false;
        }
    }

    /**
     * Select the earliest available date from the calendar
     * 
     * Logic:
     * 1. Check current month for available dates (td.date-availiable)
     * 2. If none found, click next month button (fc-next-button)
     * 3. Repeat until available date found or max months reached
     * 4. Click on first available date
     */
    private async selectEarliestDate(): Promise<string | null> {
        const maxMonthAttempts = 6;

        for (let monthAttempt = 0; monthAttempt < maxMonthAttempts; monthAttempt++) {
            try {
                await new Promise(r => setTimeout(r, 2000));

                // Get current month for logging
                const monthHeader = await this.page.locator('.fc-toolbar-title, h2').first().textContent().catch(() => 'Unknown');
                console.log(`\n   📅 Checking month: ${monthHeader?.trim()}`);
                await this.takeScreenshot(`month-${monthAttempt + 1}`);

                // Find available dates - VFS uses "date-availiable" class (with typo!)
                const availableDates = await this.page.locator('td.fc-daygrid-day.date-availiable, td.date-availiable').all();
                console.log(`   🔍 Found ${availableDates.length} available dates in ${monthHeader?.trim()}`);

                if (availableDates.length > 0) {
                    // Get the first available date
                    const firstAvailable = availableDates[0];

                    // Get date info
                    const dateNumber = await firstAvailable.locator('.fc-daygrid-day-number, a').first().textContent().catch(() => '');
                    const dataDate = await firstAvailable.getAttribute('data-date').catch(() => '');

                    console.log(`   🎯 First available date: ${dateNumber?.trim()} (${dataDate})`);

                    // Scroll and click
                    await firstAvailable.scrollIntoViewIfNeeded();
                    await new Promise(r => setTimeout(r, 500));

                    await this.behavior.naturalClick(firstAvailable);
                    console.log(`   ✅ Clicked available date: ${dateNumber?.trim()}`);

                    await new Promise(r => setTimeout(r, 2000));

                    // Verify time slots appeared
                    const timeSlotsVisible = await this.page.locator('table.ba-slot-table, h2:has-text("Choose an appointment time")').isVisible({ timeout: 5000 }).catch(() => false);

                    if (timeSlotsVisible) {
                        console.log(`   ✅ Time slots appeared!`);
                        return dataDate || dateNumber?.trim() || 'Available date';
                    } else {
                        console.log(`   ⚠️ Time slots not visible, trying next available date...`);

                        // Try second available date if exists
                        if (availableDates.length > 1) {
                            const secondAvailable = availableDates[1];
                            const date2Num = await secondAvailable.locator('.fc-daygrid-day-number, a').first().textContent().catch(() => '');
                            const date2 = await secondAvailable.getAttribute('data-date');

                            await secondAvailable.scrollIntoViewIfNeeded();
                            await this.behavior.naturalClick(secondAvailable);
                            console.log(`   ✅ Clicked second available date: ${date2Num?.trim()}`);
                            await new Promise(r => setTimeout(r, 2000));
                            return date2 || date2Num?.trim() || 'Available date';
                        }
                    }
                }

                // No available dates in this month - navigate to next month
                console.log('   ➡️ No available dates in this month, going to next...');

                const nextMonthClicked = await this.clickNextMonth();
                if (!nextMonthClicked) {
                    console.log('   ❌ Could not navigate to next month');
                    break;
                }

            } catch (error) {
                console.log(`   ❌ Error in month attempt ${monthAttempt}:`, error);
                continue;
            }
        }

        console.log('   ❌ No available dates found in any month');
        return null;
    }

    /**
     * Click the next month arrow button
     * DOM: button.fc-next-button with title="Next month"
     */
    private async clickNextMonth(): Promise<boolean> {
        try {
            const nextButtonSelectors = [
                'button.fc-next-button',
                'button[title="Next month"]',
                'button[aria-label="next month"]',
                'button:has(.fc-icon-chevron-right)',
                '.fc-button-group button:last-child',
            ];

            for (const selector of nextButtonSelectors) {
                try {
                    const nextBtn = this.page.locator(selector).first();

                    if (await nextBtn.isVisible({ timeout: 2000 })) {
                        const isDisabled = await nextBtn.isDisabled().catch(() => false);
                        if (isDisabled) {
                            console.log(`   ⚠️ Next month button is disabled`);
                            continue;
                        }

                        await this.behavior.naturalClick(nextBtn);
                        console.log('   ➡️ Clicked next month button');
                        await new Promise(r => setTimeout(r, 2000));
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // Force click fallback
            const anyNextBtn = this.page.locator('button.fc-next-button, button[title*="Next"]').first();
            if (await anyNextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anyNextBtn.click({ force: true });
                console.log('   ➡️ Force clicked next month');
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }

            console.log('   ❌ Next month button not found');
            return false;
        } catch (error) {
            console.log('   ❌ Error clicking next month:', error);
            return false;
        }
    }

    /**
     * Select the earliest available time slot
     * DOM: table.ba-slot-table with "Select" buttons for each time slot
     */
    private async selectEarliestTimeSlot(): Promise<string | null> {
        try {
            await new Promise(r => setTimeout(r, 2000));

            console.log('   🔍 Looking for time slot table...');

            const tableVisible = await this.page.locator('table.ba-slot-table, .ba-slot-table').isVisible({ timeout: 5000 }).catch(() => false);

            if (!tableVisible) {
                console.log('   ⚠️ Time slot table not visible');
                return null;
            }

            // Find Select buttons
            const selectButtonSelectors = [
                'table.ba-slot-table button:has-text("Select")',
                '.ba-slot-table button:has-text("Select")',
                'tr:has(td) button:has-text("Select")',
            ];

            for (const selector of selectButtonSelectors) {
                try {
                    const buttons = await this.page.locator(selector).all();
                    console.log(`   📋 Found ${buttons.length} Select buttons with: ${selector}`);

                    if (buttons.length > 0) {
                        const firstButton = buttons[0];

                        if (await firstButton.isVisible()) {
                            // Get time from the row
                            const row = this.page.locator(`tr:has(button:has-text("Select"))`).first();
                            const timeCell = row.locator('td.align-middle, td:first-child').first();
                            const timeText = await timeCell.textContent().catch(() => 'Unknown time');

                            await firstButton.scrollIntoViewIfNeeded();
                            await new Promise(r => setTimeout(r, 300));

                            await this.behavior.naturalClick(firstButton);
                            console.log(`   ✅ Clicked Select for time: ${timeText?.trim()}`);

                            await new Promise(r => setTimeout(r, 2000));
                            return timeText?.trim() || 'Selected';
                        }
                    }
                } catch (e) {
                    console.log(`   ⚠️ Selector error: ${selector}`);
                    continue;
                }
            }

            // Fallback
            const anySelectBtn = this.page.locator('button:has-text("Select")').first();
            if (await anySelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await anySelectBtn.click({ force: true });
                console.log('   ✅ Force clicked first Select button');
                await new Promise(r => setTimeout(r, 2000));
                return 'Selected';
            }

            console.log('   ❌ No time slots found');
            return null;
        } catch (error) {
            console.log('   ❌ Error selecting time:', error);
            return null;
        }
    }

    /**
     * Click the Continue button to proceed
     */
    private async clickContinueButton(): Promise<boolean> {
        try {
            console.log('   🔍 Looking for Continue button...');

            const buttonSelectors = [
                'button.btn-brand-orange:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange.btn-block:has-text("Continue")',
                'button.btn-brand-orange:has-text("Continue")',
                'button:has(span.mdc-button__label:has-text("Continue"))',
                'button:has-text("Continue"):not(:has-text("Go Back"))',
            ];

            for (const selector of buttonSelectors) {
                try {
                    const button = this.page.locator(selector).first();
                    if (await button.isVisible({ timeout: 3000 })) {
                        const isDisabled = await button.isDisabled().catch(() => false);
                        if (isDisabled) {
                            console.log(`   ⚠️ Continue button disabled`);
                            continue;
                        }

                        await button.scrollIntoViewIfNeeded();
                        await new Promise(r => setTimeout(r, 500));

                        await this.behavior.naturalClick(button);
                        console.log('   ✅ Clicked Continue');

                        await new Promise(r => setTimeout(r, 2000));
                        await this.checkAndHandleCaptcha();
                        await new Promise(r => setTimeout(r, 3000));
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // Force click fallback
            const anyButton = this.page.locator('button:has-text("Continue")').first();
            if (await anyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                const isDisabled = await anyButton.isDisabled().catch(() => false);
                if (!isDisabled) {
                    await anyButton.click({ force: true });
                    console.log('   ✅ Force clicked Continue');
                    await new Promise(r => setTimeout(r, 3000));
                    return true;
                }
            }

            console.log('   ⚠️ Continue button not found or disabled');
            return false;
        } catch (error) {
            console.log('   ❌ Error clicking Continue:', error);
            return false;
        }
    }
}
