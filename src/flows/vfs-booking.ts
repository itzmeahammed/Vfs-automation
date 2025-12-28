/**
 * VFS Global Malta Booking Flow
 * 
 * Philosophy: "Handle post-login booking steps with the same human-like behavior."
 * 
 * This module handles:
 * 1. Clicking "Start New Booking" on dashboard
 * 2. Selecting Application Centre (Malta Visa application center - Dubai/Abu Dhabi)
 * 3. Category auto-selects as "Short Stay"
 * 4. Selecting Sub-category (from config: Tourism, Business, etc.)
 * 5. Detecting earliest available slot date
 * 6. Clicking Continue and filling Your Details form
 */

import { Page, Locator } from 'playwright';
import * as fs from 'fs';
import {
    HumanTimingEngine,
    BehaviorSimulator,
} from '../core/index.js';
import {
    vfsConfig,
    APPLICATION_CENTRES,
    SUB_CATEGORIES,
    type ApplicantDetails,
} from '../config/applicant-config.js';
import { delay } from '../config/timing-config.js';

export interface BookingConfig {
    /** Sub-category to select: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family' */
    subCategory: string;
    /** Application centre to select (default: Malta Visa application center- Dubai) */
    applicationCentre?: string;
    /** Applicant details for form filling */
    applicant?: ApplicantDetails;
    /** Booking mode: 'earliest_slot' (quick check) or 'full_scenario' (complete booking) */
    mode?: 'earliest_slot' | 'full_scenario';
}

export interface BookingResult {
    success: boolean;
    state: 'booking_started' | 'failed' | 'form_filled' | 'slot_found' | 'details_page' | 'details_filled' | 'summary_page' | 'book_appointment';
    message: string;
    earliestSlot?: string;
    screenshot?: string;
}

const SUB_CATEGORY_MAP: Record<string, string> = {
    'tourism': 'Tourism',
    'business': 'Business',
    'sports_cultural': 'Sports and Cultural',
    'visiting_family': 'Visiting Family and Friends',
};

// Load config from applicant-config.ts
const DEFAULT_CONFIG: BookingConfig = {
    subCategory: vfsConfig.booking.subCategory,
    applicationCentre: APPLICATION_CENTRES[vfsConfig.booking.applicationCentre],
    applicant: vfsConfig.applicant,
};


/**
 * VFS Malta Booking Flow Orchestrator
 * 
 * Handles the booking form after successful login.
 */
export class VFSBookingFlow {
    private page: Page;
    private timing: HumanTimingEngine;
    private behavior: BehaviorSimulator;
    private config: BookingConfig;
    private screenshotDir: string = './screenshots';
    private stepCounter: number = 0;

    constructor(page: Page, config: Partial<BookingConfig> = {}) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.timing = new HumanTimingEngine();
        this.behavior = new BehaviorSimulator(page, this.timing);

        // Create screenshot directory if it doesn't exist
        this.ensureScreenshotDir();
    }

    /**
     * Ensure screenshot directory exists
     */
    private ensureScreenshotDir(): void {
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    /**
     * Take a screenshot with step number and description
     */
    private async takeScreenshot(description: string): Promise<string> {
        this.stepCounter++;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${this.screenshotDir}/step-${this.stepCounter.toString().padStart(2, '0')}-${description}-${timestamp}.png`;

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
     * This can appear at any step during the booking flow
     * Dialog shows "Verify Captcha" title, "Success!" with Cloudflare logo, and Submit button
     */
    private async checkAndHandleCaptcha(): Promise<boolean> {
        try {
            // Check for various captcha dialog indicators
            const captchaSelectors = [
                'app-cloudflare-dialog',
                '.mat-mdc-dialog-surface:has-text("Verify Captcha")',
                '.mat-mdc-dialog-surface:has-text("Success!")',
                '.cdk-overlay-pane:has-text("Verify Captcha")',
                'mat-dialog-container:has-text("Captcha")',
            ];

            let captchaFound = false;
            for (const selector of captchaSelectors) {
                try {
                    const dialog = this.page.locator(selector).first();
                    if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
                        captchaFound = true;
                        console.log(`\n   🤖 Captcha popup detected! (${selector})`);
                        break;
                    }
                } catch {
                    continue;
                }
            }

            if (!captchaFound) {
                // Also check page content for "Verify Captcha" text
                const pageText = await this.page.textContent('body').catch(() => '');
                if (pageText?.includes('Verify Captcha') ||
                    (pageText?.includes('Success!') && pageText?.includes('CLOUDFLARE'))) {
                    captchaFound = true;
                    console.log('\n   🤖 Captcha detected by page content!');
                }
            }

            if (!captchaFound) {
                return false; // No captcha detected
            }

            await this.takeScreenshot('captcha-detected');

            // Wait for human verification (5 seconds as requested)
            console.log('   ⏳ Waiting 5 seconds for captcha verification...');
            await new Promise(r => setTimeout(r, 5000));

            // Look for Submit button - multiple selectors based on DOM
            const submitSelectors = [
                // Exact matches from user's DOM structure
                'app-cloudflare-dialog button.btn-brand-orange:has(span.mdc-button__label:has-text("Submit"))',
                '.mat-mdc-dialog-surface button.btn-brand-orange:has-text("Submit")',
                'mat-dialog-actions button.btn-brand-orange:has-text("Submit")',
                'button.btn-brand-orange.mat-btn-lg:has-text("Submit")',
                // Fallbacks
                '.cdk-overlay-pane button:has-text("Submit")',
                'button.btn-brand-orange:has-text("Submit")',
                'button:has(span.mdc-button__label:has-text("Submit"))',
            ];

            for (const selector of submitSelectors) {
                try {
                    const submitBtn = this.page.locator(selector).first();
                    if (await submitBtn.isVisible({ timeout: 2000 })) {
                        console.log(`   🖱️ Found Submit button: ${selector}`);
                        await submitBtn.scrollIntoViewIfNeeded();
                        await new Promise(r => setTimeout(r, 300));

                        // Try natural click first
                        await this.behavior.naturalClick(submitBtn);
                        console.log('   ✅ Clicked Submit on captcha dialog');

                        // Wait for dialog to close
                        await new Promise(r => setTimeout(r, 3000));
                        await this.takeScreenshot('captcha-submitted');
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // Force click fallback
            console.log('   🔄 Trying force click on Submit...');
            const anySubmit = this.page.locator('button:has-text("Submit")').first();
            if (await anySubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anySubmit.click({ force: true });
                console.log('   ✅ Force clicked Submit');
                await new Promise(r => setTimeout(r, 3000));
                return true;
            }

            console.log('   ⚠️ Could not find Submit button in captcha dialog');
            return false;
        } catch (error) {
            console.log('   ⚠️ Captcha check error:', error);
            return false;
        }
    }

    /**
     * Execute the complete booking flow
     */
    async execute(): Promise<BookingResult> {
        console.log('\n' + '═'.repeat(60));
        console.log('📋 VFS Malta Booking Flow - Starting');
        console.log('═'.repeat(60) + '\n');

        try {
            // Step 1: Wait for dashboard
            const dashboardReady = await this.waitForDashboard();
            if (!dashboardReady) {
                await this.takeScreenshot('dashboard-failed');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Dashboard did not load after login',
                };
            }
            await this.takeScreenshot('dashboard-loaded');

            // Step 2: Click "Start New Booking"
            const bookingStarted = await this.clickStartNewBooking();
            if (!bookingStarted) {
                await this.takeScreenshot('start-booking-failed');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not click Start New Booking button',
                };
            }

            // Step 3: Wait for application details page
            await this.waitForApplicationDetailsPage();
            await this.takeScreenshot('application-details-page');

            // Step 4: Select Application Centre (this auto-selects "Short Stay" category)
            const centreSelected = await this.selectApplicationCentre();
            if (!centreSelected) {
                await this.takeScreenshot('centre-selection-failed');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not select Application Centre',
                };
            }
            await this.takeScreenshot('centre-selected');

            // Wait for loader after Application Centre selection
            await this.waitForLoader();

            // Step 5: Select Category dropdown with retry (Japan doesn't auto-select)
            console.log('📂 Selecting Category...');
            let categorySelected = false;
            for (let retry = 1; retry <= 3; retry++) {
                console.log(`   📍 Category attempt ${retry}/3...`);
                categorySelected = await this.selectCategory();
                if (categorySelected) {
                    await this.waitForLoader();
                    // Verify selection
                    const verified = await this.verifyDropdownSelected(1);
                    if (verified) {
                        console.log('   ✅ Category selected and verified');
                        break;
                    }
                }
                await delay(500);
            }
            if (!categorySelected) {
                console.log('   ❌ Category selection failed after 3 attempts');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not select Category',
                };
            }

            // Step 6: Select Sub-category dropdown with retry
            console.log('📁 Selecting Sub-category...');
            let subCategorySelected = false;
            for (let retry = 1; retry <= 3; retry++) {
                console.log(`   📍 Sub-category attempt ${retry}/3...`);
                subCategorySelected = await this.selectSubCategory();
                if (subCategorySelected) {
                    await this.waitForLoader();
                    // Verify selection
                    const verified = await this.verifyDropdownSelected(2);
                    if (verified) {
                        console.log('   ✅ Sub-category selected and verified');
                        break;
                    }
                }
                await delay(500);
            }
            if (!subCategorySelected) {
                await this.takeScreenshot('subcategory-selection-failed');
                console.log('   ❌ Sub-category selection failed after 3 attempts');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not select Sub-category',
                };
            }
            await this.takeScreenshot('subcategory-selected');

            // Wait for loader to disappear after sub-category selection
            console.log('\n   ⏳ Waiting for loader to disappear...');
            await this.waitForLoader();  // Wait until loader is gone

            // Step 7: ALL 3 DROPDOWNS SELECTED - Now detect earliest available slot
            console.log('\n   ✅ All 3 dropdowns filled successfully!');
            console.log('   📋 Form Summary:');
            console.log(`      - Centre: ${this.config.applicationCentre}`);
            console.log(`      - Category: E-Visa Tourist Single Entry`);
            console.log(`      - Sub-category: ${SUB_CATEGORY_MAP[this.config.subCategory] || this.config.subCategory}`);
            console.log('\n   ⏳ Waiting 5 seconds for slot info to render...');
            await new Promise(r => setTimeout(r, 5000));  // STRICT 5 second wait (not affected by timing mode)
            console.log('   ✅ 5-second wait complete!');

            // Detect slot info
            console.log('\n🔍 Looking for earliest available slots...');
            const slotInfo = await this.detectEarliestSlot();
            await this.takeScreenshot('slot-detection');

            if (slotInfo) {
                console.log(`\n🎯 SLOTS FOUND:\n${slotInfo}`);

                // Check mode - return early for EARLIEST_SLOT, continue for FULL_SCENARIO
                if (this.config.mode !== 'full_scenario') {
                    // EARLIEST_SLOT MODE: Return immediately with slot info
                    console.log('\n✅ Returning with slot info (EARLIEST_SLOT mode - no form filling)');
                    return {
                        success: true,
                        state: 'slot_found',
                        message: 'Slots found!',
                        earliestSlot: slotInfo,
                    };
                }

                // FULL_SCENARIO MODE: Continue with full booking process
                console.log('\n📋 FULL SCENARIO MODE - Continuing with booking...');

                // Step 8: Click Continue button
                console.log('\n➡️ Clicking Continue button...');
                const continueClicked = await this.clickContinueButton();

                if (!continueClicked) {
                    await this.takeScreenshot('continue-button-failed');
                    return {
                        success: true,
                        state: 'slot_found',
                        message: `Slot found: ${slotInfo}, but could not click Continue`,
                        earliestSlot: slotInfo,
                    };
                }
                await this.takeScreenshot('continue-clicked');

                // Step 9: Wait for Your Details page
                console.log('\n📝 Waiting for Your Details page...');
                const detailsPageLoaded = await this.waitForYourDetailsPage();

                if (detailsPageLoaded) {
                    await this.takeScreenshot('your-details-page');

                    // Step 10: Fill the Your Details form
                    const formFilled = await this.fillYourDetailsForm();
                    await this.takeScreenshot('form-filled');

                    if (formFilled) {
                        // Step 11: Click Save button
                        const saved = await this.clickSaveButton();
                        await this.takeScreenshot('save-clicked');

                        if (saved) {
                            // Step 12: Wait for Summary page and click Continue
                            const continuedFromSummary = await this.waitForSummaryAndContinue();
                            await this.takeScreenshot('summary-page');

                            if (continuedFromSummary) {
                                // Step 13: Wait for Book Appointment page
                                const bookAppointmentLoaded = await this.waitForBookAppointmentPage();
                                await this.takeScreenshot('book-appointment-page');

                                return {
                                    success: true,
                                    state: bookAppointmentLoaded ? 'book_appointment' : 'summary_page',
                                    message: bookAppointmentLoaded
                                        ? `Ready to book appointment! Slot: ${slotInfo}`
                                        : `Summary complete, waiting for Book Appointment page. Slot: ${slotInfo}`,
                                    earliestSlot: slotInfo,
                                };
                            }

                            return {
                                success: true,
                                state: 'details_filled',
                                message: `Form saved but could not continue from Summary. Slot: ${slotInfo}`,
                                earliestSlot: slotInfo,
                            };
                        }

                        return {
                            success: true,
                            state: 'details_page',
                            message: `Form filled but Save failed. Slot: ${slotInfo}`,
                            earliestSlot: slotInfo,
                        };
                    }

                    return {
                        success: true,
                        state: 'details_page',
                        message: `On Your Details page but form fill had issues. Slot: ${slotInfo}`,
                        earliestSlot: slotInfo,
                    };
                }

                return {
                    success: true,
                    state: 'slot_found',
                    message: `Slot found: ${slotInfo}, Continue clicked`,
                    earliestSlot: slotInfo,
                };
            }

            return {
                success: true,
                state: 'form_filled',
                message: 'Form filled, but no slot info found yet',
            };

        } catch (error) {
            console.error('❌ Booking flow error:', error);
            const screenshotPath = `./error-booking-${Date.now()}.png`;
            await this.page.screenshot({ path: screenshotPath });

            return {
                success: false,
                state: 'failed',
                message: `Booking error: ${error instanceof Error ? error.message : 'Unknown'}`,
                screenshot: screenshotPath,
            };
        }
    }

    /**
     * Wait for dashboard page to load after login
     */
    private async waitForDashboard(): Promise<boolean> {
        console.log('🏠 Waiting for dashboard...');

        try {
            // Check if we're already on dashboard or need to navigate
            const currentUrl = this.page.url();
            if (!currentUrl.includes('/dashboard')) {
                console.log('   ⏳ Not on dashboard yet, waiting for redirect...');
                await this.page.waitForURL('**/dashboard', { timeout: 50000 });
            }

            console.log('   📍 URL confirmed: dashboard page');

            // Wait a bit for Angular to render
            await new Promise(r => setTimeout(r, 3000));

            // Try multiple approaches to find the button
            const buttonSelectors = [
                // Most specific - from actual DOM inspection
                'button.custom-height-button',
                'button:has(span.mdc-button__label:has-text("Start New Booking"))',
                // Common VFS button classes
                'button.btn-brand-orange',
                'button[mat-raised-button]',
                // By text content
                'button:has-text("Start New Booking")',
                // By class patterns
                'button.mdc-button--raised',
                // Fallback
                'button.mat-mdc-raised-button',
            ];

            let buttonFound = false;

            for (const selector of buttonSelectors) {
                try {
                    const button = this.page.locator(selector).first();
                    const isVisible = await button.isVisible({ timeout: 3000 });

                    if (isVisible) {
                        // Double-check text content
                        const text = await button.textContent().catch(() => '');
                        if (text?.includes('Start New Booking') || text?.includes('New Booking')) {
                            console.log(`   ✅ Found button with selector: ${selector}`);
                            buttonFound = true;
                            break;
                        }
                    }
                } catch {
                    continue;
                }
            }

            if (!buttonFound) {
                // Last resort: just check if ANY content loaded
                console.log('   ⚠️ Button not found by selector, checking page content...');
                const pageContent = await this.page.textContent('body').catch(() => '');

                if (pageContent?.includes('Start New Booking')) {
                    console.log('   ✅ Dashboard content found via text search');
                    buttonFound = true;
                } else if (pageContent?.includes('Active application')) {
                    console.log('   ✅ Dashboard loaded (Active applications visible)');
                    buttonFound = true;
                }
            }

            if (buttonFound) {
                console.log('   ✅ Dashboard loaded');
                // Human pause to "observe" the page
                await new Promise(r => setTimeout(r, this.timing.getThinkingPause('simple')));
                return true;
            }

            console.log('   ❌ Could not verify dashboard content');
            return false;
        } catch (error) {
            console.log('   ❌ Dashboard wait failed:', error);
            return false;
        }
    }

    /**
     * Click the "Start New Booking" button
     */
    private async clickStartNewBooking(): Promise<boolean> {
        console.log('🆕 Clicking "Start New Booking"...');

        try {
            const buttonSelectors = [
                // Most specific - from actual DOM inspection (same as waitForDashboard)
                'button.custom-height-button',
                'button:has(span.mdc-button__label:has-text("Start New Booking"))',
                // Common VFS button classes  
                'button.btn-brand-orange',
                'button:has-text("Start New Booking")',
                'a:has-text("Start New Booking")',
                'button[mat-raised-button]',
                'button.mat-raised-button',
            ];

            let button: Locator | null = null;

            for (const selector of buttonSelectors) {
                const candidate = this.page.locator(selector).first();
                if (await candidate.isVisible({ timeout: 2000 }).catch(() => false)) {
                    button = candidate;
                    console.log(`   ✅ Found button with: ${selector}`);
                    break;
                }
            }

            if (!button) {
                console.log('   ❌ Start New Booking button not found');
                return false;
            }

            // Natural click with human behavior
            await this.behavior.naturalClick(button);
            console.log('   ✅ Clicked Start New Booking');

            // Wait for navigation
            await new Promise(r => setTimeout(r, 3000));

            return true;
        } catch (error) {
            console.log('   ❌ Click failed:', error);
            return false;
        }
    }

    /**
     * Wait for application details page
     */
    private async waitForApplicationDetailsPage(): Promise<void> {
        console.log('📝 Waiting for Application Details page...');

        try {
            await this.page.waitForURL('**/application-detail', { timeout: 20000 });
            await this.page.waitForSelector('text=Appointment Details', { timeout: 15000 });
            console.log('   ✅ Application Details page loaded');

            // Human reading pause
            await new Promise(r => setTimeout(r, this.timing.getThinkingPause('moderate')));
        } catch {
            console.log('   ⚠️ Page load wait timed out, continuing anyway...');
        }
    }

    /**
     * Wait for Angular loader/spinner to disappear
     */
    private async waitForLoader(): Promise<void> {
        try {
            // Common Angular loader/spinner selectors
            const loaderSelectors = [
                '.loader',
                '.spinner',
                '.loading',
                'mat-spinner',
                '.mat-progress-spinner',
                '.cdk-overlay-backdrop',
            ];

            for (const selector of loaderSelectors) {
                const loader = this.page.locator(selector);
                if (await loader.isVisible({ timeout: 500 }).catch(() => false)) {
                    console.log(`   ⏳ Waiting for loader to disappear...`);
                    await loader.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
                    await delay(300);
                    break;
                }
            }

            // Small delay to let Angular update DOM
            await delay(300);
        } catch {
            // Loader already gone or not present
        }
    }

    /**
     * Verify a dropdown has a selected value (not placeholder)
     * @param dropdownIndex 0=Centre, 1=Category, 2=Sub-category
     */
    private async verifyDropdownSelected(dropdownIndex: number): Promise<boolean> {
        try {
            const dropdown = this.page.locator('mat-select').nth(dropdownIndex);

            // Check if dropdown has a selected value (not placeholder text)
            const value = await dropdown.locator('.mat-mdc-select-value-text, .mat-select-value-text').textContent({ timeout: 2000 });

            if (value && value.trim() && !value.includes('Select') && !value.includes('Choose')) {
                console.log(`   ✅ Dropdown ${dropdownIndex} verified: "${value.trim().substring(0, 30)}..."`);
                return true;
            }

            console.log(`   ⚠️ Dropdown ${dropdownIndex} not yet selected`);
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Select Application Centre from dropdown
     * Has retry logic since dropdowns sometimes need multiple clicks
     */
    private async selectApplicationCentre(): Promise<boolean> {
        console.log('🏢 Selecting Application Centre...');

        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   📍 Attempt ${attempt}/${maxRetries}...`);

                // Strategy 1: User-Provided XPath (1st mat-form-field)
                let dropdown = this.page.locator('xpath=/html/body/app-root/div/main/div/app-eligibility-criteria/section/form/mat-card[1]/form/div[1]/mat-form-field/div[1]/div/div[2]/mat-select').first();

                if (!await dropdown.isVisible()) {
                    // Fallback
                    dropdown = this.page.locator('mat-select').first();
                }

                if (!await dropdown.isVisible({ timeout: 5000 })) {
                    console.log('   ❌ Application Centre dropdown not found');
                    continue;
                }

                // Click to open dropdown (Force Click for reliability)
                await new Promise(r => setTimeout(r, 1000));
                await dropdown.click({ force: true });

                // Wait for dropdown panel to appear
                console.log('   ⏳ Waiting for dropdown panel...');
                await new Promise(r => setTimeout(r, 1500));

                // Wait for overlay with options
                try {
                    await this.page.waitForSelector('.cdk-overlay-container mat-option', {
                        state: 'visible',
                        timeout: 3000
                    });
                    console.log('   ✅ Dropdown panel opened');
                } catch {
                    console.log('   ⚠️ Dropdown panel not visible, will retry...');

                    // Try clicking again
                    await this.behavior.naturalClick(dropdown);
                    await new Promise(r => setTimeout(r, 2000));

                    // Check again
                    const optionsVisible = await this.page.locator('.cdk-overlay-container mat-option').first().isVisible({ timeout: 2000 }).catch(() => false);
                    if (!optionsVisible) {
                        console.log('   ⚠️ Still no options, retrying from start...');
                        // Press Escape to close any partial overlay
                        await this.page.keyboard.press('Escape');
                        await new Promise(r => setTimeout(r, 500));
                        continue;
                    }
                }

                // Find and click the option - Japan Visa Application Centre, Dubai (id=DXB)
                const optionText = this.config.applicationCentre || 'Japan Visa Application Centre, Dubai';

                // Try multiple strategies to find the option
                const selectionStrategies = [
                    // Strategy 1: User Suggested Specific Option (Option 6)
                    // Prioritized to avoid "Dubai Silicon Oasis" mismatch
                    () => this.page.locator('xpath=/html/body/div[4]/div[2]/div/div/mat-option[6]'),

                    // Strategy 2: Strict Text Match (Japan Visa Application Centre, Dubai)
                    () => this.page.locator('mat-option').filter({ hasText: 'Japan Visa Application Centre, Dubai' }).first(),

                    // Strategy 3: ID Fallback
                    () => this.page.locator('mat-option#DXB').first(),
                ];

                for (const getOption of selectionStrategies) {
                    const option = getOption();
                    if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
                        const text = await option.textContent();
                        await option.click({ force: true });
                        console.log(`   ✅ Clicked option: ${text?.trim()}`);

                        // Wait for selection to register - STRICT 2 seconds
                        await new Promise(r => setTimeout(r, 2000));

                        // Verify selection actually worked
                        const dropdown = this.page.locator('mat-select').first();
                        const selectedValue = await dropdown.textContent();
                        if (selectedValue && !selectedValue.includes('Choose your Application')) {
                            console.log(`   ✅ Verified selection: ${selectedValue.trim()}`);
                            return true;
                        } else {
                            console.log(`   ⚠️ Selection not verified, dropdown still shows: ${selectedValue?.trim()}`);
                            // Try clicking the option again
                            await option.click({ force: true });
                            await new Promise(r => setTimeout(r, 2000));
                            return true;
                        }
                    }
                }

                // If we get here, options were visible but no match found - list them
                const allOptions = await this.page.locator('mat-option').allTextContents();
                console.log('   📋 Available options:', allOptions);

            } catch (error) {
                console.log(`   ⚠️ Attempt ${attempt} failed:`, error);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                console.log(`   🔄 Retrying in 2 seconds...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        console.log('   ❌ Could not select Application Centre after all retries');
        return false;
    }

    /**
     * Select Category dropdown (for Japan - doesn't auto-select)
     * Select "E-Visa - *Tourist Single Entry" (id=JUV4) from mat-select-2
     */
    private async selectCategory(): Promise<boolean> {
        console.log('   🔍 Looking for Category dropdown...');

        try {
            // Wait for page to be stable - STRICT wait
            await new Promise(r => setTimeout(r, 1500));

            // Category: User XPath (div[2])
            let dropdown = this.page.locator('xpath=/html/body/app-root/div/main/div/app-eligibility-criteria/section/form/mat-card[1]/form/div[2]/mat-form-field/div[1]/div/div[2]/mat-select').first();

            if (!await dropdown.isVisible()) {
                // Fallback
                dropdown = this.page.locator('mat-select#mat-select-2');
            }

            if (!await dropdown.isVisible({ timeout: 5000 })) {
                console.log('   ❌ Category dropdown mat-select-2 not visible');
                return false;
            }

            // Click to open dropdown - try multiple times
            for (let clickAttempt = 1; clickAttempt <= 3; clickAttempt++) {
                await dropdown.click({ force: true });
                console.log(`   ✅ Clicked category dropdown (attempt ${clickAttempt})`);

                // Wait for options panel to appear - STRICT wait
                await new Promise(r => setTimeout(r, 1500));

                // Wait for mat-option to be visible
                try {
                    await this.page.waitForSelector('mat-option', { state: 'visible', timeout: 3000 });
                    console.log('   ✅ Options panel opened');
                    break; // Success, exit click loop
                } catch {
                    if (clickAttempt < 3) {
                        console.log('   ⚠️ Options panel not visible, clicking again...');
                        // Press Escape to close partial overlay
                        await this.page.keyboard.press('Escape');
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        console.log('   ⚠️ Options panel not visible after 3 clicks');
                        return false;
                    }
                }
            }

            // Click E-Visa Tourist Single Entry (id=JUV4)
            const optionSelectors = [
                'mat-option#JUV4',
                'mat-option:has-text("E-Visa - *Tourist Single Entry")',
                'mat-option:has-text("Tourist Single Entry")',
                'mat-option:has-text("E-Visa")',
            ];

            for (const selector of optionSelectors) {
                const option = this.page.locator(selector).first();
                if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
                    const text = await option.textContent();
                    await option.click({ force: true });
                    console.log(`   ✅ Selected category: ${text?.trim()}`);
                    await new Promise(r => setTimeout(r, 1000));
                    return true;
                }
            }

            // List all available options for debugging
            const allOptions = await this.page.locator('mat-option').allTextContents();
            console.log('   📋 Available options:', allOptions);

            console.log('   ❌ Could not find category option');
            return false;
        } catch (error) {
            console.log('   ❌ Error selecting category:', error);
            return false;
        }
    }

    /**
     * Select Sub-category based on config
     * Japan uses JUSV7 for "Single Entry Tourism General"
     */
    private async selectSubCategory(): Promise<boolean> {
        console.log('   � Looking for Sub-category dropdown...');

        try {
            // Wait for page to be stable after category selection - STRICT wait
            await new Promise(r => setTimeout(r, 1500));

            // Sub-category: User XPath (div[3])
            let dropdown = this.page.locator('xpath=/html/body/app-root/div/main/div/app-eligibility-criteria/section/form/mat-card[1]/form/div[3]/mat-form-field/div[1]/div/div[2]/mat-select').first();

            if (!await dropdown.isVisible()) {
                // Fallback
                dropdown = this.page.locator('mat-select').nth(2);
            }

            if (!await dropdown.isVisible({ timeout: 3000 })) {
                console.log('   ❌ Sub-category dropdown not visible');
                return false;
            }

            // Click to open dropdown
            await dropdown.click({ force: true });
            console.log('   ✅ Clicked sub-category dropdown');

            // Wait for options panel to appear - STRICT wait
            await new Promise(r => setTimeout(r, 1500));

            // Wait for mat-option to be visible
            try {
                await this.page.waitForSelector('mat-option', { state: 'visible', timeout: 5000 });
                console.log('   ✅ Options panel opened');
            } catch {
                console.log('   ⚠️ Options panel not visible, retrying click...');
                await dropdown.click({ force: true });
                await new Promise(r => setTimeout(r, 1500));
            }

            // Get the display text for the sub-category
            const subCategoryKey = this.config.subCategory.toLowerCase().replace(/\s+/g, '_');
            const subCategoryText = SUB_CATEGORY_MAP[subCategoryKey] || this.config.subCategory;

            console.log(`   🔍 Looking for: "${subCategoryText}"`);

            // Try multiple selection strategies based on DOM structure
            // From DOM: mat-option has id like "Tou" for Tourism, text in span.mdc-list-item__primary-text

            // Strategy 1: By ID - Japan uses JUSV7 for Single Entry Tourism General
            const idMap: Record<string, string> = {
                'tourism': 'JUSV7',           // Japan: Single Entry Tourism General
                'single_entry_tourism': 'JUSV7',
                'business': 'BUS',
                'sports_cultural': 'Sports',
                'visiting_family': 'Visit',
            };

            const optionId = idMap[subCategoryKey];
            if (optionId) {
                const optionById = this.page.locator(`mat-option#${optionId}`);
                if (await optionById.isVisible({ timeout: 2000 })) {
                    await optionById.click({ force: true });
                    console.log(`   ✅ Selected by ID: ${optionId}`);
                    return true;
                }
            }

            // Strategy 2: Look for Single Entry Tourism General text
            const japanOptions = [
                () => this.page.locator('mat-option#JUSV7').first(),
                () => this.page.locator('mat-option:has-text("Single Entry Tourism General")').first(),
                () => this.page.locator('mat-option:has-text("Tourism General")').first(),
            ];

            for (const getOption of japanOptions) {
                const option = getOption();
                if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
                    const text = await option.textContent();
                    await option.click({ force: true });
                    console.log(`   ✅ Selected Japan sub-category: ${text?.trim()}`);
                    return true;
                }
            }

            // Strategy 2: By text content in the option
            const option = this.page.locator('mat-option').filter({ hasText: subCategoryText }).first();
            if (await option.isVisible({ timeout: 2000 })) {
                await this.behavior.naturalClick(option);
                console.log(`   ✅ Selected: ${subCategoryText}`);
                return true;
            }

            // Strategy 3: Find by span text
            const spanOption = this.page.locator(`mat-option:has(span.mdc-list-item__primary-text:has-text("${subCategoryText}"))`).first();
            if (await spanOption.isVisible({ timeout: 2000 })) {
                await this.behavior.naturalClick(spanOption);
                console.log(`   ✅ Selected via span: ${subCategoryText}`);
                return true;
            }

            // Strategy 4: Get all options and find matching one
            const allOptions = await this.page.locator('mat-option').all();
            console.log(`   📋 Found ${allOptions.length} options in dropdown`);

            for (const opt of allOptions) {
                const text = await opt.textContent();
                console.log(`      - Option: "${text?.trim()}"`);
                if (text?.toLowerCase().includes(subCategoryText.toLowerCase())) {
                    await this.behavior.naturalClick(opt);
                    console.log(`   ✅ Selected: ${text?.trim()}`);
                    return true;
                }
            }

            console.log('   ❌ Could not find specified sub-category');
            return false;
        } catch (error) {
            console.log('   ❌ Error selecting Sub-category:', error);
            return false;
        }
    }

    /**
     * Detect ALL "Earliest available slot" texts (1, 2, 3-4 applicants)
     * Returns formatted list of all slots found
     */
    private async detectEarliestSlot(): Promise<string | null> {
        console.log('   ⏳ Looking for slot information...');

        try {
            // Wait for slot info to render (reduced from 3s to 1s)
            await delay(500);

            // Get all slot texts from page
            const pageContent = await this.page.textContent('body');
            if (!pageContent) {
                console.log('   ⚠️ No page content');
                return null;
            }

            // Match all "Earliest available slot for X Applicants is : DD-MM-YYYY" patterns
            const allSlots: string[] = [];
            const slotPattern = /Earliest available slot for ([^:]+): (\d{2}-\d{2}-\d{4})/gi;
            let match;
            while ((match = slotPattern.exec(pageContent)) !== null) {
                const applicants = match[1].trim();
                const date = match[2];
                const slotText = `${applicants}: ${date}`;
                if (!allSlots.includes(slotText)) {
                    allSlots.push(slotText);
                    console.log(`   🎯 ${slotText}`);
                }
            }

            if (allSlots.length > 0) {
                const slotsFormatted = allSlots.map((s, i) => `${i + 1}. ${s}`).join('\n');
                console.log(`\n📋 ALL SLOTS:\n${slotsFormatted}`);
                return slotsFormatted;
            }

            console.log('   ⚠️ No slot information found');
            return null;
        } catch (error) {
            console.log('   ❌ Error detecting slots:', error);
            return null;
        }
    }

    /**
     * Click the Continue button after selecting appointment details
     * Button is inside mat-card with class btn-brand-orange
     */
    private async clickContinueButton(): Promise<boolean> {
        try {
            console.log('   🖱️ Preparing to click Continue...');
            await new Promise(r => setTimeout(r, 2000));

            const buttonSelectors = [
                // Strategy 1: User-Provided XPath
                'xpath=/html/body/app-root/div/main/div/app-eligibility-criteria/section/form/mat-card[2]/button',
                // Fallbacks
                'mat-card button.btn-brand-orange',
                'button:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange:has-text("Continue")',
                'button:has-text("Continue")',
                'button.mdc-button--raised:has-text("Continue")',
            ];

            let button: Locator | null = null;

            for (const selector of buttonSelectors) {
                try {
                    const candidate = this.page.locator(selector).first();
                    if (await candidate.isVisible({ timeout: 3000 })) {
                        button = candidate;
                        console.log(`   ✅ Found Continue button with: ${selector}`);
                        break;
                    }
                } catch {
                    continue;
                }
            }

            if (!button) {
                console.log('   ❌ Continue button not found');
                return false;
            }

            // User requested 2 clicks due to flakiness
            for (let i = 1; i <= 2; i++) {
                if (await button.isVisible()) {
                    console.log(`   🖱️ Clicking Continue (${i}/2)...`);
                    await button.click({ force: true });
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            // Wait for navigation
            await new Promise(r => setTimeout(r, 3000));

            return true;
        } catch (error) {
            console.log('   ❌ Failed to click Continue:', error);
            return false;
        }
    }

    /**
     * Wait for Your Details page to load
     * URL: https://visa.vfsglobal.com/are/en/jpn/your-details
     */
    private async waitForYourDetailsPage(): Promise<boolean> {
        try {
            console.log('   ⏳ Waiting for Your Details page...');

            // Wait for URL to change
            await this.page.waitForURL('**/your-details', { timeout: 30000 });
            console.log('   📍 URL confirmed: your-details page');

            // Wait for page content to load
            await new Promise(r => setTimeout(r, 3000));

            // Check for "Your Details" heading or form elements
            const pageContent = await this.page.textContent('body').catch(() => '');

            if (pageContent?.includes('Your Details') || pageContent?.includes('Applicant')) {
                console.log('   ✅ Your Details page loaded');

                // Check for the 13-second warning
                if (pageContent?.includes('Please wait 13 seconds')) {
                    console.log('   ⏳ Waiting 15 seconds as requested by page...');
                    await new Promise(r => setTimeout(r, 15000));
                }

                return true;
            }

            // Try waiting for form fields
            const formSelectors = [
                'input[placeholder*="First Name" i]',
                'input[placeholder*="FIRST NAME" i]',
                'mat-form-field input',
            ];

            for (const selector of formSelectors) {
                try {
                    const field = this.page.locator(selector).first();
                    if (await field.isVisible({ timeout: 5000 })) {
                        console.log('   ✅ Your Details form detected');
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            console.log('   ⚠️ Could not verify Your Details page content');
            return false;
        } catch (error) {
            console.log('   ❌ Your Details page wait failed:', error);
            return false;
        }
    }

    /**
     * Fill the Your Details form with applicant information
     * Uses the config from applicant-config.ts
     */
    async fillYourDetailsForm(): Promise<boolean> {
        console.log('\n📝 Filling Your Details form...');

        const applicant = this.config.applicant;
        if (!applicant) {
            console.log('   ❌ No applicant details in config');
            return false;
        }

        try {
            // Wait for form to be ready
            await new Promise(r => setTimeout(r, 2000));

            // ═══════════════════════════════════════════════════════════
            // FIRST NAME
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling First Name...');
            const firstNameInput = this.page.locator('input[placeholder*="first name" i], input[formcontrolname*="firstName" i]').first();
            if (await firstNameInput.isVisible({ timeout: 5000 })) {
                await this.behavior.robustFill(firstNameInput, applicant.firstName, 'First Name');
            } else {
                console.log('   ⚠️ First Name field not found');
            }

            // ═══════════════════════════════════════════════════════════
            // LAST NAME
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Last Name...');
            const lastNameInput = this.page.locator('input[placeholder*="last name" i], input[formcontrolname*="lastName" i]').first();
            if (await lastNameInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(lastNameInput, applicant.lastName, 'Last Name');
            } else {
                console.log('   ⚠️ Last Name field not found');
            }

            // ═══════════════════════════════════════════════════════════
            // GENDER
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Selecting Gender...');
            await this.selectGender(applicant.gender);

            // ═══════════════════════════════════════════════════════════
            // DATE OF BIRTH
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Entering Date of Birth...');
            await this.enterDateOfBirth(applicant.dateOfBirth);

            // ═══════════════════════════════════════════════════════════
            // NATIONALITY (Dropdown)
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Selecting Nationality...');
            await this.selectNationality(applicant.nationality);

            // ═══════════════════════════════════════════════════════════
            // PASSPORT NUMBER
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Passport Number...');
            await this.enterPassportNumber(applicant.passportNumber);

            // ═══════════════════════════════════════════════════════════
            // PASSPORT EXPIRY
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Passport Expiry...');
            await this.enterPassportExpiry(applicant.passportExpiry);

            // ═══════════════════════════════════════════════════════════
            // CONTACT NUMBER (Country Code + Number)
            // Based on DOM: Two inputs in a row - col-sm-4 for code, col-sm-8 for number
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Contact Number...');

            // Find the contact number section by looking for the row with two inputs
            // Country code input (first input in the contact row, smaller column)
            const phoneCodeSelectors = [
                'div.col-sm-4 input',
                'input[placeholder*="country code" i]',
                'input[placeholder*="code" i]',
                'div.row.align-items-end input:first-of-type',
            ];

            for (const selector of phoneCodeSelectors) {
                try {
                    const input = this.page.locator(selector).first();
                    if (await input.isVisible({ timeout: 2000 })) {
                        await this.behavior.robustFill(input, applicant.phoneCode, 'Phone Code');
                        console.log('   ✅ Phone code filled');
                        break;
                    }
                } catch {
                    continue;
                }
            }

            // Phone number input (second input, larger column)
            const phoneNumberSelectors = [
                'div.col-sm-8 input',
                'input[placeholder*="contact number" i]',
                'input[placeholder*="phone" i]',
                'input[placeholder*="mobile" i]',
            ];

            for (const selector of phoneNumberSelectors) {
                try {
                    const input = this.page.locator(selector).first();
                    if (await input.isVisible({ timeout: 2000 })) {
                        await this.behavior.robustFill(input, applicant.phoneNumber, 'Phone Number');
                        console.log('   ✅ Phone number filled');
                        break;
                    }
                } catch {
                    continue;
                }
            }

            // ═══════════════════════════════════════════════════════════
            // EMAIL
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Email...');
            const emailInput = this.page.locator('input[placeholder*="email" i], input[type="email"], input[formcontrolname*="email" i]').first();
            if (await emailInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(emailInput, applicant.email, 'Email');
            } else {
                console.log('   ⚠️ Email field not found');
            }

            // ═══════════════════════════════════════════════════════════
            // ADDRESS LINE 1
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Address Line 1...');
            const address1Input = this.page.locator('input[placeholder*="address line 1" i], input[formcontrolname*="addressLine1" i]').first();
            if (await address1Input.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(address1Input, applicant.addressLine1, 'Address Line 1');
            }

            // ═══════════════════════════════════════════════════════════
            // ADDRESS LINE 2 (Optional)
            // ═══════════════════════════════════════════════════════════
            if (applicant.addressLine2) {
                console.log('   📝 Filling Address Line 2...');
                const address2Input = this.page.locator('input[placeholder*="address line 2" i], input[formcontrolname*="addressLine2" i]').first();
                if (await address2Input.isVisible({ timeout: 3000 })) {
                    await this.behavior.robustFill(address2Input, applicant.addressLine2, 'Address Line 2');
                }
            }

            // ═══════════════════════════════════════════════════════════
            // STATE
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling State...');
            const stateInput = this.page.locator('input[placeholder*="state" i], input[formcontrolname*="state" i]').first();
            if (await stateInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(stateInput, applicant.state, 'State');
            }

            // ═══════════════════════════════════════════════════════════
            // CITY
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling City...');
            const cityInput = this.page.locator('input[placeholder*="city" i], input[formcontrolname*="city" i]').first();
            if (await cityInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(cityInput, applicant.city, 'City');
            }

            // ═══════════════════════════════════════════════════════════
            // POSTCODE
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Postcode...');
            const postcodeInput = this.page.locator('input[placeholder*="postcode" i], input[placeholder*="postal" i], input[formcontrolname*="postCode" i]').first();
            if (await postcodeInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(postcodeInput, applicant.postcode, 'Postcode');
            }

            console.log('\n   ✅ Form filled successfully!');
            console.log('   📋 Summary:');
            console.log(`      - Name: ${applicant.firstName} ${applicant.lastName}`);
            console.log(`      - Passport: ${applicant.passportNumber}`);
            console.log(`      - Nationality: ${applicant.nationality}`);
            console.log(`      - Email: ${applicant.email}`);
            console.log(`      - Phone: +${applicant.phoneCode} ${applicant.phoneNumber}`);

            // Check for captcha popup that may have appeared during form filling
            console.log('\n   🔍 Checking for captcha popup...');
            const captchaHandled = await this.checkAndHandleCaptcha();
            if (captchaHandled) {
                console.log('   ✅ Captcha handled before Save');
            }

            return true;
        } catch (error) {
            console.log('   ❌ Error filling form:', error);
            return false;
        }
    }

    /**
     * Select Gender dropdown
     */
    private async selectGender(gender: string): Promise<boolean> {
        console.log(`   📝 Selecting Gender: ${gender}...`);

        try {
            // Strategy 1: User-Provided XPath (app-dynamic-control[9])
            // Using relative xpath for robustness: //app-dynamic-control[9]//mat-select
            let dropdown = this.page.locator('xpath=//app-dynamic-control[9]//mat-select').first();

            if (!await dropdown.isVisible()) {
                // Strategy 2: Label "Gender"
                dropdown = this.page.locator('mat-form-field').filter({ hasText: 'Gender' }).locator('mat-select').first();
            }

            if (!await dropdown.isVisible()) {
                // Strategy 3: Form control name
                dropdown = this.page.locator('mat-select[formcontrolname*="gender" i]').first();
            }

            if (!await dropdown.isVisible()) {
                // Strategy 4: First visible mat-select (Legacy)
                dropdown = this.page.locator('mat-select').first();
            }

            if (await dropdown.isVisible()) {
                await dropdown.click();
                await new Promise(r => setTimeout(r, 1000)); // Strict wait for panel

                // Select option (Strict match to avoid Male matching Female)
                const option = this.page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${gender}\\s*$`, 'i') }).first();
                if (await option.isVisible()) {
                    await option.click({ force: true });
                    await new Promise(r => setTimeout(r, 500));
                    console.log(`   ✅ Selected Gender: ${gender}`);
                    return true;
                }

                // Fallback option
                const optionCI = this.page.locator('mat-option').filter({ hasText: new RegExp(gender, 'i') }).first();
                if (await optionCI.isVisible()) {
                    await optionCI.click();
                    console.log(`   ✅ Selected Gender (CI): ${gender}`);
                    return true;
                }

                // Close if failed
                await this.page.keyboard.press('Escape');
            }

            console.log('   ❌ Gender dropdown/option not found');
            return false;

        } catch (error) {
            console.log('   ❌ Error selecting gender:', error);
            return false;
        }
    }

    /**
     * Enter Date of Birth
     * Format: DD/MM/YYYY
     */
    private async enterDateOfBirth(dob: string): Promise<boolean> {
        console.log(`   📝 Entering DOB: ${dob}...`);
        try {
            // Identify input (Updated with user screenshots)
            // 1. Exact ID
            let input = this.page.locator('#dateOfBirth').first();

            if (!await input.isVisible()) {
                input = this.page.locator('input[placeholder="Please select the date"]').first();
            }

            if (!await input.isVisible()) {
                input = this.page.locator('input[ngbdatepicker]').first();
            }

            if (!await input.isVisible()) {
                // Form control name fallback
                input = this.page.locator('input[formcontrolname*="dateOfBirth" i]').first();
            }

            if (!await input.isVisible()) {
                // 2. By placeholder
                input = this.page.locator('input[placeholder="DD/MM/YYYY"]').first();
            }

            if (!await input.isVisible()) {
                // 3. Angular Material Datepicker input
                input = this.page.locator('input[matdatepicker]').first();
            }

            if (!await input.isVisible()) {
                // 4. By Label "Date Of Birth"
                const label = this.page.locator('label:has-text("Date Of Birth"), mat-label:has-text("Date Of Birth")').first();
                if (await label.isVisible()) {
                    // Try to find input inside the same mat-form-field or parent
                    input = label.locator('xpath=./ancestor::mat-form-field//input').first();
                }
            }

            if (!await input.isVisible()) {
                // 5. Try looking for calendar icon parent
                input = this.page.locator('mat-datepicker-toggle').first().locator('xpath=../preceding-sibling::input').first();
            }

            if (await input.isVisible()) {
                await input.click();
                // Robust clear
                await input.press('Control+A');
                await input.press('Backspace');
                await new Promise(r => setTimeout(r, 200));

                // Type date (digits only to avoid double-slashes)
                const cleanDate = dob.replace(/[^0-9]/g, '');
                await this.page.keyboard.type(cleanDate, { delay: 100 });
                console.log('   ✅ Entered DOB');
                return true;
            } else {
                console.log('   ⚠️ DOB input not found. Trying Generic input approach...');
                // 6. Just find the 3rd VISIBLE input (First Name, Last Name, DOB...)
                const inputs = await this.page.locator('input').all();
                let visibleInputs = [];
                for (const inp of inputs) {
                    if (await inp.isVisible()) visibleInputs.push(inp);
                }

                if (visibleInputs.length >= 3) {
                    console.log(`   Using 3rd visible input (of ${visibleInputs.length}) as fallback for DOB...`);
                    const fallbackInput = visibleInputs[2];
                    await fallbackInput.click();
                    await fallbackInput.clear();
                    await this.page.keyboard.type(dob, { delay: 100 });
                    console.log('   ✅ Entered DOB (Fallback)');
                    return true;
                }

                return false;
            }
        } catch (error) {
            console.log('   ❌ Error entering DOB:', error);
            return false;
        }
    }

    private async enterPassportNumber(number: string): Promise<boolean> {
        console.log(`   📝 Entering Passport Number: ${number}...`);
        const selectors = [
            'xpath=//app-dynamic-control[11]//input',
            'input[formcontrolname*="passportNumber" i]',
            'input[name*="passport" i]',
            'input[placeholder*="Passport Number" i]',
            'input[placeholder*="passport" i]'
        ];

        for (const selector of selectors) {
            const input = this.page.locator(selector).first();
            if (await input.isVisible()) {
                await input.scrollIntoViewIfNeeded();
                await input.click();
                await input.clear();
                await this.page.keyboard.type(number, { delay: 100 });
                console.log('   ✅ Entered Passport Number');
                return true;
            }
        }
        console.log('   ⚠️ Passport Number input not found');
        return false;
    }

    private async enterPassportExpiry(date: string): Promise<boolean> {
        console.log(`   📝 Entering Passport Expiry: ${date}...`);

        // Strategy 1: User-Provided XPath (app-dynamic-control[12])
        let input = this.page.locator('xpath=//app-dynamic-control[12]//input').first();

        if (!await input.isVisible()) {
            // Strategy 2: Exact ID fallback
            input = this.page.locator('#passportExpiryDate').first();
        }

        if (!await input.isVisible()) {
            input = this.page.locator('input[formcontrolname*="passportExpir" i]').first();
        }

        if (!await input.isVisible()) {
            input = this.page.locator('input[placeholder*="Expiry" i]').first();
        }

        if (await input.isVisible()) {
            await input.scrollIntoViewIfNeeded();
            await input.click();
            // Robust clear
            await input.press('Control+A');
            await input.press('Backspace');
            await new Promise(r => setTimeout(r, 200));

            // Type date (digits only)
            const cleanDate = date.replace(/[^0-9]/g, '');
            await this.page.keyboard.type(cleanDate, { delay: 100 });
            await this.page.keyboard.press('Tab');
            console.log('   ✅ Entered Passport Expiry');
            return true;
        }
        console.log('   ⚠️ Passport Expiry input not found');
        return false;
    }

    /**
     * Select nationality from dropdown
     * DOM: mat-select-3-panel with options having span.mdc-list-item__primary-text
     * Options have IDs like mat-option-7 (AFGHANISTAN), mat-option-8 (ALBANIA), etc.
     */
    private async selectNationality(nationality: string): Promise<boolean> {
        const maxRetries = 5;
        const nationalityUpper = nationality.toUpperCase().trim();

        console.log(`   🎯 Target nationality: "${nationalityUpper}"`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   📍 Nationality attempt ${attempt}/${maxRetries}...`);

                // Strategy 1: User-Provided XPath (app-dynamic-control[10])
                let dropdown = this.page.locator('xpath=//app-dynamic-control[10]//mat-select').first();

                if (!await dropdown.isVisible()) {
                    // Strategy 2: Label "Current Nationality"
                    dropdown = this.page.locator('mat-form-field').filter({ hasText: 'Current Nationality' }).locator('mat-select').first();
                }

                if (!await dropdown.isVisible()) {
                    // Try just "Nationality" if "Current Nationality" fails
                    dropdown = this.page.locator('mat-form-field').filter({ hasText: 'Nationality' }).locator('mat-select').first();
                }

                if (!await dropdown.isVisible()) {
                    // Fallback: form control name
                    dropdown = this.page.locator('mat-select[formcontrolname*="nationality" i]').first();
                }

                if (!await dropdown.isVisible()) {
                    // Fallback: Use the 2nd visible mat-select on the page
                    console.log('   ⚠️ Generic fallback: Looking for 2nd visible mat-select...');
                    const selects = await this.page.locator('mat-select').all();
                    let visibleCount = 0;
                    for (const s of selects) {
                        if (await s.isVisible()) {
                            if (visibleCount === 1) { // Index 1 = 2nd item
                                dropdown = s;
                                break;
                            }
                            visibleCount++;
                        }
                    }
                }

                if (await dropdown.isVisible()) {
                    await dropdown.scrollIntoViewIfNeeded();

                    // Click carefully
                    await dropdown.click();

                    // Wait for panel (either .mat-mdc-select-panel or .cdk-overlay-pane)
                    await this.page.waitForSelector('.mat-mdc-select-panel, .cdk-overlay-pane', { state: 'visible', timeout: 5000 });
                    await new Promise(r => setTimeout(r, 500)); // Animation wait

                    // Click option
                    // Selector based on screenshots: mat-option matching text
                    const option = this.page.locator('mat-option').filter({ hasText: nationalityUpper }).first();

                    if (await option.isVisible()) {
                        await option.scrollIntoViewIfNeeded();
                        await option.click();
                        console.log(`   ✅ Selected Nationality: ${nationality}`);
                        return true;
                    } else {
                        console.log(`   ⚠️ Option '${nationalityUpper}' not found visible in panel.`);
                    }

                    // Close if failed
                    await this.page.keyboard.press('Escape');
                } else {
                    console.log('   ⚠️ Dropdown not found');
                }

                await new Promise(r => setTimeout(r, 1000));
            } catch (e: any) {
                console.log(`   ⚠️ Failed attempt ${attempt}: ${e.message}`);
                // Ensure dropdown is closed
                await this.page.keyboard.press('Escape').catch(() => { });
            }
        }

        console.log(`   ❌ Could not select nationality: ${nationality}`);
        return false;
    }

    /**
     * Verify that nationality was actually selected
     */
    private async verifyNationalitySelected(expectedNationality: string): Promise<boolean> {
        try {
            await new Promise(r => setTimeout(r, 500));

            // Check the displayed value in the mat-select
            const valueSelectors = [
                'mat-form-field:has-text("Nationality") .mat-mdc-select-value-text',
                'mat-form-field:has-text("Current Nationality") .mat-mdc-select-value-text',
                'mat-select#mat-select-3 .mat-mdc-select-value-text',
            ];

            for (const selector of valueSelectors) {
                try {
                    const valueText = await this.page.locator(selector).first().textContent();
                    if (valueText?.toUpperCase().includes(expectedNationality.toUpperCase())) {
                        console.log(`   ✅ VERIFIED: Nationality is "${valueText?.trim()}"`);
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            console.log(`   ⚠️ Could not verify nationality selection`);
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Click the Save button on Your Details form
     * DOM: button.mdc-button--outlined.btn-brand-orange with span.mdc-button__label "Save"
     */
    async clickSaveButton(): Promise<boolean> {
        console.log('\n💾 Clicking Save button...');

        try {
            // First check for any validation errors
            const validationErrors = await this.page.locator('mat-error, .error-message, [class*="error"]').allTextContents();
            if (validationErrors.some(e => e.trim().length > 0)) {
                console.log('   ⚠️ Form validation errors detected:', validationErrors.filter(e => e.trim()));
            }

            const buttonSelectors = [
                // Strategy 1: User-Provided XPath
                'xpath=/html/body/app-root/div/main/div/app-applicant-details/section/mat-card[2]/app-dynamic-form/div/div/app-dynamic-control/div/div/div[2]/button',
                // Fallbacks
                'button.btn-brand-orange.btn-block:has(span.mdc-button__label:has-text("Save"))',
                'button.mdc-button--outlined.btn-brand-orange:has-text("Save")',
                'button.btn-brand-orange:has(span.mdc-button__label:has-text("Save"))',
                'button:has(span.mdc-button__label:has-text("Save"))',
                'button.btn-brand-orange:has-text("Save")',
                'button:has-text("Save"):not(:has-text("Cancel"))',
            ];

            for (const selector of buttonSelectors) {
                try {
                    const button = this.page.locator(selector).first();
                    if (await button.isVisible({ timeout: 3000 })) {
                        // Scroll into view first
                        await button.scrollIntoViewIfNeeded();
                        await new Promise(r => setTimeout(r, 500));

                        // Check if button is enabled
                        const isDisabled = await button.isDisabled();
                        if (isDisabled) {
                            console.log('   ⚠️ Save button is disabled - checking for errors');
                            continue;
                        }

                        // Click with multiple methods
                        console.log(`   🖱️ Clicking with selector: ${selector}`);

                        // Method 1: Natural click
                        await this.behavior.naturalClick(button);
                        await new Promise(r => setTimeout(r, 2000));

                        // Check for captcha popup
                        await this.checkAndHandleCaptcha();

                        // Check if page changed (URL or content)
                        const pageContent = await this.page.textContent('body').catch(() => '');
                        if (pageContent?.includes('Your Details Summary') ||
                            (pageContent?.includes('Applicant 1') && pageContent?.includes('Add another'))) {
                            console.log('   ✅ Save successful - Summary page detected');
                            await new Promise(r => setTimeout(r, 2000));
                            return true;
                        }

                        // If still on same page, try force click
                        console.log('   🔄 Retrying with force click...');
                        await button.click({ force: true });
                        await new Promise(r => setTimeout(r, 3000));

                        // Check for captcha again
                        await this.checkAndHandleCaptcha();

                        // Check again
                        const newContent = await this.page.textContent('body').catch(() => '');
                        if (newContent?.includes('Your Details Summary') ||
                            (newContent?.includes('Applicant 1') && newContent?.includes('Add another'))) {
                            console.log('   ✅ Save successful after force click');
                            return true;
                        }

                        // Take note of current state
                        console.log('   ⚠️ Page may not have changed after click');
                        return true; // Return true anyway since we clicked
                    }
                } catch (e) {
                    console.log(`   ⚠️ Selector failed: ${selector}`, e);
                    continue;
                }
            }

            console.log('   ❌ Save button not found');
            return false;
        } catch (error) {
            console.log('   ❌ Error clicking Save:', error);
            return false;
        }
    }

    /**
     * Wait for Your Details Summary page and click Continue
     * This appears after successfully saving applicant details
     * URL stays the same but content changes to "Your Details Summary"
     */
    async waitForSummaryAndContinue(): Promise<boolean> {
        console.log('\n📋 Waiting for Your Details Summary page...');

        try {
            // Try multiple indicators for summary page
            const summaryIndicators = [
                'text="Your Details Summary"',
                'text="Applicant 1"',
                'h2:has-text("Your Details Summary")',
                '.card:has-text("Applicant")',
                'text="Add another applicant"',
            ];

            let summaryFound = false;

            // Check if we're already on summary page
            const currentContent = await this.page.textContent('body').catch(() => '');
            if (currentContent?.includes('Your Details Summary') ||
                (currentContent?.includes('Applicant 1') && currentContent?.includes('Add another'))) {
                console.log('   ✅ Already on Summary page');
                summaryFound = true;
            }

            // If not found, wait for any indicator
            if (!summaryFound) {
                for (const indicator of summaryIndicators) {
                    try {
                        await this.page.waitForSelector(indicator, { timeout: 10000 });
                        console.log(`   ✅ Summary page loaded (found: ${indicator})`);
                        summaryFound = true;
                        break;
                    } catch {
                        continue;
                    }
                }
            }

            if (!summaryFound) {
                console.log('   ⚠️ Summary page not detected, checking current page...');
                await this.takeScreenshot('summary-not-found');

                // Check for captcha popup
                const captchaHandled = await this.checkAndHandleCaptcha();
                if (captchaHandled) {
                    console.log('   🔄 Captcha handled, rechecking page...');
                    await new Promise(r => setTimeout(r, 2000));
                }

                // Maybe we're still on the form page - check for Save button
                const saveVisible = await this.page.locator('button:has-text("Save")').isVisible().catch(() => false);
                if (saveVisible) {
                    console.log('   ⚠️ Still on form page - Save may not have worked');
                    return false;
                }
            }

            // Wait a bit for animations
            await new Promise(r => setTimeout(r, 2000));

            // Check for captcha before clicking Continue
            await this.checkAndHandleCaptcha();

            // Click Continue button (from user's DOM - mat-stroked-button with mdc-button__label "Continue")
            console.log('\n➡️ Clicking Continue on Summary page...');

            const continueSelectors = [
                // From user's DOM - exact match
                'button.mat-stroked-button.btn-brand-orange:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-block.btn-brand-orange:has(span.mdc-button__label:has-text("Continue"))',
                'button.mat-mdc-outlined-button.btn-brand-orange:has-text("Continue")',
                'button.btn-brand-orange:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange.btn-block:has-text("Continue")',
                'button:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange:has-text("Continue")',
                'button:has-text("Continue"):not(:has-text("Go Back")):not(:has-text("Cancel"))',
            ];

            for (const selector of continueSelectors) {
                try {
                    const button = this.page.locator(selector).first();
                    if (await button.isVisible({ timeout: 3000 })) {
                        console.log(`   🖱️ Found Continue with: ${selector}`);
                        await button.scrollIntoViewIfNeeded();
                        await new Promise(r => setTimeout(r, 500));

                        // Try natural click first
                        await this.behavior.naturalClick(button);
                        console.log('   ✅ Clicked Continue');

                        // Wait and check for captcha
                        await new Promise(r => setTimeout(r, 2000));
                        await this.checkAndHandleCaptcha();

                        // Wait for navigation to Book Appointment page
                        await new Promise(r => setTimeout(r, 3000));
                        return true;
                    }
                } catch {
                    continue;
                }
            }

            // If not found, try force click on any Continue button
            console.log('   🔄 Trying force click on Continue...');
            const anyButton = this.page.locator('button:has-text("Continue")').first();
            if (await anyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anyButton.click({ force: true });
                console.log('   ✅ Force clicked Continue');
                await new Promise(r => setTimeout(r, 3000));
                return true;
            }

            console.log('   ❌ Continue button not found');
            return false;
        } catch (error) {
            console.log('   ❌ Error on Summary page:', error);
            return false;
        }
    }

    /**
     * Wait for Book Appointment page to load
     * URL: /book-appointment
     */
    async waitForBookAppointmentPage(): Promise<boolean> {
        console.log('\n📅 Waiting for Book Appointment page...');

        try {
            await this.page.waitForURL('**/book-appointment', { timeout: 30000 });
            console.log('   ✅ Book Appointment page loaded');

            // Wait for content
            await new Promise(r => setTimeout(r, 3000));

            return true;
        } catch (error) {
            console.log('   ❌ Book Appointment page not loaded:', error);
            return false;
        }
    }
}

