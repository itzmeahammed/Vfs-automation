/**
 * VFS Global Malta - Book Appointment Flow
 * 
 * Philosophy: "Handle appointment booking with human-like behavior."
 * 
 * This module handles the /book-appointment page:
 * 1. Navigating months until finding available dates
 * 2. Selecting appointment date (td with class "date-availiable" - note VFS typo!)
 * 3. Selecting available time slot from ba-slot-box
 * 4. Clicking Continue to proceed
 */

import { Page } from 'playwright';
import * as fs from 'fs';
import {
    HumanTimingEngine,
    BehaviorSimulator,
} from '../core/index.js';

export interface AppointmentResult {
    success: boolean;
    state: 'waiting' | 'date_selected' | 'time_selected' | 'services_done' | 'review_done' | 'confirmed' | 'failed';
    message: string;
    appointmentDate?: string;
    appointmentTime?: string;
    screenshot?: string;
    reviewDetails?: ReviewDetails;
}

export interface ReviewDetails {
    applicationId?: string;
    applicantName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    appointmentLocation?: string;
    visaCategory?: string;
    totalAmount?: string;
}

/**
 * VFS Malta Appointment Booking Flow
 * 
 * DOM Structure:
 * - Calendar: full-calendar with fc-daygrid-body
 * - Available dates: td.fc-daygrid-day.date-availiable (VFS uses typo "availiable")
 * - Next month button: button.fc-next-button
 * - Time slots: div.ba-slot-box with input.ba-slot-radio and label.ba-slot-radio-label
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

    private async checkAndHandleCaptcha(): Promise<boolean> {
        try {
            const captchaSelectors = [
                'app-cloudflare-dialog',
                '.mat-mdc-dialog-surface:has-text("Verify Captcha")',
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

    async execute(): Promise<AppointmentResult> {
        console.log('\n' + '═'.repeat(60));
        console.log('📅 VFS Malta Appointment Booking Flow');
        console.log('═'.repeat(60) + '\n');

        try {
            // Step 1: Wait for page
            const pageReady = await this.waitForBookAppointmentPage();
            if (!pageReady) {
                await this.takeScreenshot('appointment-page-not-ready');
                return { success: false, state: 'failed', message: 'Book Appointment page not loaded' };
            }
            await this.takeScreenshot('appointment-page-loaded');

            // Step 2: Select date
            console.log('\n📆 Looking for available dates...');
            const dateInfo = await this.selectEarliestDate();
            await this.takeScreenshot('date-selection');

            if (!dateInfo) {
                return { success: false, state: 'waiting', message: 'No available dates found' };
            }

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

            await this.checkAndHandleCaptcha();

            // Step 4: Click Continue (from appointment page)
            console.log('\n➡️ Clicking Continue button...');
            const continued = await this.clickContinueButton();
            await this.takeScreenshot('after-appointment-continue');

            if (!continued) {
                return {
                    success: true,
                    state: 'time_selected',
                    message: `Selected ${dateInfo} ${timeInfo}, but Continue pending`,
                    appointmentDate: dateInfo,
                    appointmentTime: timeInfo,
                };
            }

            // Step 5: Handle Services page (just click Continue)
            console.log('\n🛒 Handling Services page...');
            await new Promise(r => setTimeout(r, 3000));
            const servicesHandled = await this.handleServicesPage();
            await this.takeScreenshot('services-page');

            if (!servicesHandled) {
                return {
                    success: true,
                    state: 'services_done',
                    message: `Appointment selected but stuck on Services page`,
                    appointmentDate: dateInfo,
                    appointmentTime: timeInfo,
                };
            }

            // Step 6: Handle Review page (log all details)
            console.log('\n📋 Handling Review page...');
            await new Promise(r => setTimeout(r, 3000));
            const reviewDetails = await this.handleReviewPage();
            await this.takeScreenshot('review-page');

            return {
                success: true,
                state: 'review_done',
                message: `Booking ready for final confirmation! ${dateInfo} at ${timeInfo}`,
                appointmentDate: dateInfo,
                appointmentTime: timeInfo,
                reviewDetails: reviewDetails,
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

    private async waitForBookAppointmentPage(): Promise<boolean> {
        console.log('📋 Checking Book Appointment page...');

        try {
            const url = this.page.url();
            console.log(`   📍 Current URL: ${url}`);

            if (!url.includes('book-appointment')) {
                console.log('   ⚠️ Not on book-appointment page');
                return false;
            }

            const calendarSelectors = ['.ba-calender-card', '.fc-daygrid-body', 'h2:has-text("Pick an appointment date")'];

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
            if (pageText?.includes('Book an Appointment')) {
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

    private async selectEarliestDate(): Promise<string | null> {
        const maxMonthAttempts = 6;

        for (let monthAttempt = 0; monthAttempt < maxMonthAttempts; monthAttempt++) {
            try {
                await new Promise(r => setTimeout(r, 2000));

                const monthHeader = await this.page.locator('.fc-toolbar-title, h2').first().textContent().catch(() => 'Unknown');
                console.log(`\n   📅 Checking month: ${monthHeader?.trim()}`);
                await this.takeScreenshot(`month-${monthAttempt + 1}`);

                // Find available dates - VFS uses "date-availiable" class (with typo!)
                const availableDates = await this.page.locator('td.fc-daygrid-day.date-availiable, td.date-availiable').all();
                console.log(`   🔍 Found ${availableDates.length} available dates`);

                if (availableDates.length > 0) {
                    const firstAvailable = availableDates[0];
                    const dateNumber = await firstAvailable.locator('.fc-daygrid-day-number, a').first().textContent().catch(() => '');
                    const dataDate = await firstAvailable.getAttribute('data-date').catch(() => '');

                    console.log(`   🎯 First available date: ${dateNumber?.trim()} (${dataDate})`);

                    await firstAvailable.scrollIntoViewIfNeeded();
                    await new Promise(r => setTimeout(r, 500));
                    await this.behavior.naturalClick(firstAvailable);
                    console.log(`   ✅ Clicked available date: ${dateNumber?.trim()}`);

                    await new Promise(r => setTimeout(r, 2000));

                    const timeSlotsVisible = await this.page.locator('div.ba-slot-box, table.ba-slot-table, h2:has-text("Choose an appointment time")').isVisible({ timeout: 5000 }).catch(() => false);

                    if (timeSlotsVisible) {
                        console.log(`   ✅ Time slots appeared!`);
                        return dataDate || dateNumber?.trim() || 'Available date';
                    } else {
                        console.log(`   ⚠️ Time slots not visible, trying next...`);
                        if (availableDates.length > 1) {
                            const secondAvailable = availableDates[1];
                            const date2 = await secondAvailable.getAttribute('data-date');
                            await secondAvailable.scrollIntoViewIfNeeded();
                            await this.behavior.naturalClick(secondAvailable);
                            console.log(`   ✅ Clicked second available date: ${date2}`);
                            await new Promise(r => setTimeout(r, 2000));
                            return date2 || 'Available date';
                        }
                    }
                }

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

    private async clickNextMonth(): Promise<boolean> {
        try {
            const nextButtonSelectors = [
                'button.fc-next-button',
                'button[title="Next month"]',
                'button:has(.fc-icon-chevron-right)',
            ];

            for (const selector of nextButtonSelectors) {
                try {
                    const nextBtn = this.page.locator(selector).first();

                    if (await nextBtn.isVisible({ timeout: 2000 })) {
                        const isDisabled = await nextBtn.isDisabled().catch(() => false);
                        if (isDisabled) continue;

                        await this.behavior.naturalClick(nextBtn);
                        console.log('   ➡️ Clicked next month button');
                        await new Promise(r => setTimeout(r, 2000));
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            const anyNextBtn = this.page.locator('button.fc-next-button').first();
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
     * 
     * DOM Structure:
     * - tr with td.align-middle containing time (e.g. "09:00")
     * - div.ba-slot-box with input.ba-slot-radio
     * - label.ba-slot-radio-label containing div.ba-slot-radio-label-text1 "Select"
     */
    private async selectEarliestTimeSlot(): Promise<string | null> {
        try {
            await new Promise(r => setTimeout(r, 2000));

            console.log('   🔍 Looking for time slot...');

            // Scroll to make time slots visible
            await this.page.evaluate(() => window.scrollBy(0, 500));
            await new Promise(r => setTimeout(r, 1000));

            // From user's DOM: div.ba-slot-box is the clickable container
            const slotSelectors = [
                'div.ba-slot-box',
                'label.ba-slot-radio-label',
                'div.ba-slot-radio-label-text1:has-text("Select")',
                'input.ba-slot-radio',
            ];

            for (const selector of slotSelectors) {
                try {
                    const slots = await this.page.locator(selector).all();
                    console.log(`   📋 Found ${slots.length} slots with: ${selector}`);

                    if (slots.length > 0) {
                        const firstSlot = slots[0];

                        if (await firstSlot.isVisible()) {
                            // Get the time from td.align-middle
                            const timeCell = await this.page.locator('td.align-middle').first().textContent().catch(() => '');
                            console.log(`   🕐 Time found: ${timeCell?.trim()}`);

                            await firstSlot.scrollIntoViewIfNeeded();
                            await new Promise(r => setTimeout(r, 300));

                            await this.behavior.naturalClick(firstSlot);
                            console.log(`   ✅ Clicked time slot: ${timeCell?.trim() || selector}`);

                            await new Promise(r => setTimeout(r, 2000));

                            // Verify selection
                            const selected = await this.page.locator('div.ba-slot-radio-label-text2:has-text("Selected"), input.ba-slot-radio:checked').isVisible({ timeout: 2000 }).catch(() => false);

                            if (selected) {
                                console.log(`   ✅ Time slot verified!`);
                            }

                            return timeCell?.trim() || 'Selected';
                        }
                    }
                } catch (e) {
                    console.log(`   ⚠️ Selector error: ${selector}`);
                    continue;
                }
            }

            // Force click fallback
            console.log('   🔄 Trying force click...');
            const anySlot = this.page.locator('div.ba-slot-box, label.ba-slot-radio-label').first();
            if (await anySlot.isVisible({ timeout: 3000 }).catch(() => false)) {
                const timeCell = await this.page.locator('td.align-middle').first().textContent().catch(() => '');
                await anySlot.click({ force: true });
                console.log(`   ✅ Force clicked: ${timeCell?.trim()}`);
                await new Promise(r => setTimeout(r, 2000));
                return timeCell?.trim() || 'Selected';
            }

            console.log('   ❌ No time slots found');
            return null;
        } catch (error) {
            console.log('   ❌ Error selecting time:', error);
            return null;
        }
    }

    private async clickContinueButton(): Promise<boolean> {
        try {
            console.log('   🔍 Looking for Continue button...');

            const buttonSelectors = [
                'button.btn-brand-orange:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange.btn-block:has-text("Continue")',
                'button.btn-brand-orange:has-text("Continue")',
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

    /**
     * Handle Services page - just click Continue (no services selected)
     * DOM: button.btn-brand-orange with Continue text
     */
    private async handleServicesPage(): Promise<boolean> {
        try {
            // Wait for Services page to load
            const url = this.page.url();
            console.log(`   📍 Current URL: ${url}`);

            // Check if we're on the services page
            const servicesHeader = await this.page.locator('h1:has-text("Services"), h2:has-text("Services")').isVisible({ timeout: 5000 }).catch(() => false);

            if (!servicesHeader) {
                console.log('   ⚠️ Services page header not found');
                // Maybe we're already on Review page?
                const reviewHeader = await this.page.locator('h1:has-text("Review"), h2:has-text("Review")').isVisible({ timeout: 2000 }).catch(() => false);
                if (reviewHeader) {
                    console.log('   ✅ Already on Review page, skipping Services');
                    return true;
                }
            }

            console.log('   📋 Services page detected');
            console.log('   ℹ️ Skipping optional services, clicking Continue...');

            // Check for captcha
            await this.checkAndHandleCaptcha();

            // Click Continue button
            const continueClicked = await this.clickContinueButton();

            if (continueClicked) {
                console.log('   ✅ Passed Services page');
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }

            console.log('   ⚠️ Could not click Continue on Services');
            return false;
        } catch (error) {
            console.log('   ❌ Error on Services page:', error);
            return false;
        }
    }

    /**
     * Handle Review page - extract and log all booking details
     */
    private async handleReviewPage(): Promise<ReviewDetails> {
        const details: ReviewDetails = {};

        try {
            // Wait for Review page
            const url = this.page.url();
            console.log(`   📍 Current URL: ${url}`);

            // Check for Review page
            const reviewHeader = await this.page.locator('h1:has-text("Review"), h2:has-text("Review")').isVisible({ timeout: 5000 }).catch(() => false);

            if (!reviewHeader) {
                console.log('   ⚠️ Review page not found');
                return details;
            }

            console.log('\n   ' + '═'.repeat(50));
            console.log('   📋 BOOKING REVIEW DETAILS');
            console.log('   ' + '═'.repeat(50));

            // Extract Application ID
            try {
                const appIdElement = await this.page.locator('text=/MAL[0-9]+/').first().textContent();
                if (appIdElement) {
                    details.applicationId = appIdElement.trim();
                    console.log(`   🆔 Application ID: ${details.applicationId}`);
                }
            } catch { /* ignore */ }

            // Extract Applicant Name
            try {
                const nameSelectors = [
                    '.applicant-name',
                    'td:has-text("Name") + td',
                    'div:has-text("Applicant") + div',
                ];
                for (const sel of nameSelectors) {
                    const name = await this.page.locator(sel).first().textContent().catch(() => '');
                    if (name && name.length > 2) {
                        details.applicantName = name.trim();
                        console.log(`   👤 Applicant: ${details.applicantName}`);
                        break;
                    }
                }
            } catch { /* ignore */ }

            // Extract Appointment Date
            try {
                const dateText = await this.page.locator('text=/[0-9]{2}-[0-9]{2}-[0-9]{4}/, text=/[0-9]{4}-[0-9]{2}-[0-9]{2}/').first().textContent();
                if (dateText) {
                    details.appointmentDate = dateText.trim();
                    console.log(`   📅 Date: ${details.appointmentDate}`);
                }
            } catch { /* ignore */ }

            // Extract Appointment Time
            try {
                const timeText = await this.page.locator('text=/[0-9]{2}:[0-9]{2}/').first().textContent();
                if (timeText) {
                    details.appointmentTime = timeText.trim();
                    console.log(`   ⏰ Time: ${details.appointmentTime}`);
                }
            } catch { /* ignore */ }

            // Extract Location
            try {
                const locSelectors = [
                    'text=/VFS Global.*Centre/i',
                    'td:has-text("Centre") + td',
                    'div:has-text("Location") + div',
                ];
                for (const sel of locSelectors) {
                    const loc = await this.page.locator(sel).first().textContent().catch(() => '');
                    if (loc && loc.length > 5) {
                        details.appointmentLocation = loc.trim();
                        console.log(`   📍 Location: ${details.appointmentLocation}`);
                        break;
                    }
                }
            } catch { /* ignore */ }

            // Extract Visa Category
            try {
                const catText = await this.page.locator('text=/Malta/i, text=/Schengen/i').first().textContent();
                if (catText) {
                    details.visaCategory = catText.trim();
                    console.log(`   🛂 Category: ${details.visaCategory}`);
                }
            } catch { /* ignore */ }

            // Extract Total Amount
            try {
                const amountText = await this.page.locator('text=/AED [0-9.]+/, text=/Total.*AED/i').first().textContent();
                if (amountText) {
                    details.totalAmount = amountText.trim();
                    console.log(`   💰 Total: ${details.totalAmount}`);
                }
            } catch { /* ignore */ }

            console.log('   ' + '═'.repeat(50));

            // Check the 3 required checkboxes
            console.log('\n   ☑️ Checking required checkboxes...');
            await this.checkRequiredCheckboxes();

            console.log('\n   🎉 BOOKING READY FOR FINAL CONFIRMATION!');
            console.log('   ⚠️ Manual payment required to complete booking.\n');

            return details;
        } catch (error) {
            console.log('   ❌ Error extracting review details:', error);
            return details;
        }
    }

    /**
     * Check the 3 required checkboxes on Review page
     * 
     * DOM Structure:
     * - mat-mdc-checkbox-1: "I accept the Terms and Conditions"
     * - mat-mdc-checkbox-2: "Yes, I agree to receive future communication..."
     * - mat-mdc-checkbox-3: "Yes, I agree for waitlist confirmation"
     */
    private async checkRequiredCheckboxes(): Promise<void> {
        try {
            // Checkbox selectors based on user's DOM screenshots
            const checkboxes = [
                {
                    id: 'mat-mdc-checkbox-1',
                    selector: '#mat-mdc-checkbox-1, mat-checkbox#mat-mdc-checkbox-1, input#mat-mdc-checkbox-1-input',
                    label: 'Terms and Conditions',
                },
                {
                    id: 'mat-mdc-checkbox-2',
                    selector: '#mat-mdc-checkbox-2, mat-checkbox#mat-mdc-checkbox-2, input#mat-mdc-checkbox-2-input',
                    label: 'Marketing communication',
                },
                {
                    id: 'mat-mdc-checkbox-3',
                    selector: '#mat-mdc-checkbox-3, mat-checkbox#mat-mdc-checkbox-3, input#mat-mdc-checkbox-3-input',
                    label: 'Waitlist confirmation',
                },
            ];

            for (const checkbox of checkboxes) {
                try {
                    // Try multiple selectors
                    const selectors = [
                        checkbox.selector,
                        `mat-checkbox[id="${checkbox.id}"]`,
                        `mat-checkbox[id="${checkbox.id}"] .mdc-checkbox`,
                        `mat-checkbox[id="${checkbox.id}"] input[type="checkbox"]`,
                        `input[id="${checkbox.id}-input"]`,
                        `label[for="${checkbox.id}-input"]`,
                    ];

                    let clicked = false;
                    for (const sel of selectors) {
                        try {
                            const element = this.page.locator(sel).first();
                            if (await element.isVisible({ timeout: 2000 })) {
                                // Check if already checked
                                const isChecked = await element.isChecked().catch(() => false);

                                if (!isChecked) {
                                    await element.scrollIntoViewIfNeeded();
                                    await new Promise(r => setTimeout(r, 300));
                                    await this.behavior.naturalClick(element);
                                    console.log(`   ✅ Checked: ${checkbox.label}`);
                                } else {
                                    console.log(`   ☑️ Already checked: ${checkbox.label}`);
                                }
                                clicked = true;
                                break;
                            }
                        } catch {
                            continue;
                        }
                    }

                    if (!clicked) {
                        // Force click fallback
                        const matCheckbox = this.page.locator(`mat-checkbox[id="${checkbox.id}"]`).first();
                        if (await matCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
                            await matCheckbox.click({ force: true });
                            console.log(`   ✅ Force checked: ${checkbox.label}`);
                        } else {
                            console.log(`   ⚠️ Could not find: ${checkbox.label}`);
                        }
                    }

                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.log(`   ⚠️ Error checking ${checkbox.label}:`, e);
                }
            }

            // Check for captcha after clicking checkboxes
            await this.checkAndHandleCaptcha();

        } catch (error) {
            console.log('   ❌ Error checking checkboxes:', error);
        }
    }
}
