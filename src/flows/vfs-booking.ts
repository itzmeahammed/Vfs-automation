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
import { getTiming, wait, waitWithVariance, delay } from '../config/timing-config.js';

export interface BookingConfig {
    /** Sub-category to select: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family' */
    subCategory: string;
    /** Application centre to select (default: Malta Visa application center- Dubai) */
    applicationCentre?: string;
    /** Applicant details for form filling */
    applicant?: ApplicantDetails;
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
            await delay(2000);

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
                        await delay(2000);

                        // Try natural click first
                        await this.behavior.naturalClick(submitBtn);
                        console.log('   ✅ Clicked Submit on captcha dialog');

                        // Wait for dialog to close
                        await delay(2000);
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
                await delay(2000);
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

            // Step 5: Wait for Angular to auto-populate "Short Stay" category
            console.log('📂 Waiting for "Short Stay" to auto-select...');
            await wait('angularRender');
            console.log('   ✅ Category auto-selected');

            // Step 6: Wait for loader to disappear before sub-category selection
            console.log('   ⏳ Waiting for loader after category selection...');
            await this.waitForLoaderToDisappear();

            // Wait for Sub-category dropdown & select
            const subCategorySelected = await this.selectSubCategory();
            if (!subCategorySelected) {
                await this.takeScreenshot('subcategory-selection-failed');
                return {
                    success: false,
                    state: 'failed',
                    message: 'Could not select Sub-category',
                };
            }
            await this.takeScreenshot('subcategory-selected');

            // Step 7: Detect earliest available slot
            console.log('\n   ✅ All dropdowns filled successfully!');
            console.log('   📋 Form Summary:');
            console.log(`      - Centre: ${this.config.applicationCentre}`);
            console.log(`      - Category: Short Stay (auto)`);
            console.log(`      - Sub-category: ${SUB_CATEGORY_MAP[this.config.subCategory] || this.config.subCategory}`);

            // Wait for slot info to appear
            console.log('\n🔍 Looking for earliest available slot...');
            const slotInfo = await this.detectEarliestSlot();
            await this.takeScreenshot('slot-detection');

            if (slotInfo) {
                console.log(`\n🎯 Earliest slot: ${slotInfo}`);

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
            await delay(2000);

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
            await delay(2000);

            return true;
        } catch (error) {
            console.log('   ❌ Click failed:', error);
            return false;
        }
    }

    /**
     * Wait for any loader/spinner to disappear
     * VFS shows loading spinners when fetching data after selections
     */
    private async waitForLoaderToDisappear(): Promise<void> {
        const loaderSelectors = [
            '.mat-spinner',
            '.mat-progress-spinner',
            '.loader',
            '.loading',
            '[class*="spinner"]',
            '[class*="loader"]',
            '[class*="loading"]',
        ];

        // Wait up to 10 seconds for loader to disappear
        for (let i = 0; i < 20; i++) {
            let loaderVisible = false;

            for (const selector of loaderSelectors) {
                try {
                    const loader = this.page.locator(selector).first();
                    if (await loader.isVisible({ timeout: 300 })) {
                        loaderVisible = true;
                        break;
                    }
                } catch {
                    continue;
                }
            }

            if (!loaderVisible) {
                console.log('   ✅ Loader finished');
                // Extra small wait for Angular to render
                await delay(500);
                return;
            }

            // Wait 500ms before checking again
            await delay(500);
            process.stdout.write('.');
        }

        console.log(''); // New line
        console.log('   ⚠️ Loader wait timed out, continuing anyway...');
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
     * Select Application Centre from dropdown
     * Has retry logic since dropdowns sometimes need multiple clicks
     */
    private async selectApplicationCentre(): Promise<boolean> {
        console.log('🏢 Selecting Application Centre...');

        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   📍 Attempt ${attempt}/${maxRetries}...`);

                // Find the first mat-select (Application Centre dropdown)
                const dropdown = this.page.locator('mat-select').first();

                if (!await dropdown.isVisible({ timeout: 5000 })) {
                    console.log('   ❌ Application Centre dropdown not found');
                    continue;
                }

                // Click to open dropdown
                await this.behavior.naturalClick(dropdown);

                // Wait for dropdown panel to appear
                console.log('   ⏳ Waiting for dropdown panel...');
                await new Promise(r => setTimeout(r, 1500 + (attempt * 500))); // Longer wait on retries

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
                    await delay(2000);

                    // Check again
                    const optionsVisible = await this.page.locator('.cdk-overlay-container mat-option').first().isVisible({ timeout: 2000 }).catch(() => false);
                    if (!optionsVisible) {
                        console.log('   ⚠️ Still no options, retrying from start...');
                        // Press Escape to close any partial overlay
                        await this.page.keyboard.press('Escape');
                        await delay(2000);
                        continue;
                    }
                }

                // Find and click the option
                const optionText = this.config.applicationCentre || 'Malta Visa application center- Dubai';

                // Try multiple strategies to find the option
                const selectionStrategies = [
                    // Strategy 1: Exact match
                    () => this.page.locator('mat-option').filter({ hasText: optionText }).first(),
                    // Strategy 2: Contains Dubai
                    () => this.page.locator('mat-option:has-text("Dubai")').first(),
                    // Strategy 3: Contains Abu Dhabi
                    () => this.page.locator('mat-option:has-text("Abu Dhabi")').first(),
                    // Strategy 4: Any Malta option
                    () => this.page.locator('mat-option:has-text("Malta")').first(),
                ];

                for (const getOption of selectionStrategies) {
                    const option = getOption();
                    if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
                        const text = await option.textContent();
                        await this.behavior.naturalClick(option);
                        console.log(`   ✅ Selected: ${text?.trim()}`);

                        // Wait for selection to register
                        await delay(2000);
                        return true;
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
                await delay(2000);
            }
        }

        console.log('   ❌ Could not select Application Centre after all retries');
        return false;
    }

    /**
     * Select Sub-category based on config
     * Note: After selecting Application Centre, "Short Stay" auto-selects
     *       So sub-category is the 2nd dropdown we interact with (index 2)
     */
    private async selectSubCategory(): Promise<boolean> {
        console.log('📁 Selecting Sub-category...');

        try {
            // Find the third mat-select (Sub-category dropdown)
            // Index: 0 = Centre, 1 = Category (auto), 2 = Sub-category
            const dropdowns = this.page.locator('mat-select');
            const dropdown = dropdowns.nth(2);

            if (!await dropdown.isVisible({ timeout: 5000 })) {
                console.log('   ❌ Sub-category dropdown not found');
                return false;
            }

            // Click to open dropdown
            await this.behavior.naturalClick(dropdown);

            // Wait longer for the dropdown panel to render (Angular can be slow)
            console.log('   ⏳ Waiting for dropdown panel...');
            await delay(2000);

            // Wait for the overlay container with options to appear
            try {
                await this.page.waitForSelector('.cdk-overlay-container mat-option', {
                    state: 'visible',
                    timeout: 5000
                });
                console.log('   ✅ Dropdown panel opened');
            } catch {
                console.log('   ⚠️ Dropdown panel slow to open, retrying click...');
                await this.behavior.naturalClick(dropdown);
                await delay(2000);
            }

            // Get the display text for the sub-category
            const subCategoryKey = this.config.subCategory.toLowerCase().replace(/\s+/g, '_');
            const subCategoryText = SUB_CATEGORY_MAP[subCategoryKey] || this.config.subCategory;

            console.log(`   🔍 Looking for: "${subCategoryText}"`);

            // Try multiple selection strategies based on DOM structure
            // From DOM: mat-option has id like "Tou" for Tourism, text in span.mdc-list-item__primary-text

            // Strategy 1: By ID (Tourism = "Tou", Business = "BUS", etc.)
            const idMap: Record<string, string> = {
                'tourism': 'Tou',
                'business': 'BUS',
                'sports_cultural': 'Sports',
                'visiting_family': 'Visit',
            };

            const optionId = idMap[subCategoryKey];
            if (optionId) {
                const optionById = this.page.locator(`mat-option#${optionId}`);
                if (await optionById.isVisible({ timeout: 2000 })) {
                    await this.behavior.naturalClick(optionById);
                    console.log(`   ✅ Selected by ID: ${optionId}`);
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
     * Detect the "Earliest available slot" text and extract the date
     * Example: "Earliest available slot for 1 Applicants is : 13-01-2026"
     */
    private async detectEarliestSlot(): Promise<string | null> {
        console.log('   ⏳ Waiting for slot information to appear...');

        try {
            // IMPORTANT: Wait for the loader/spinner to disappear first
            // The page shows a loading animation while fetching slot data
            console.log('   ⏳ Waiting for loader to finish...');

            const loaderSelectors = [
                '.loader',           // Generic loader
                '.loading',          // Loading class
                '.mat-spinner',      // Angular Material spinner
                '.mat-progress-spinner',
                '[class*="loader"]',
                '[class*="loading"]',
                '[class*="spinner"]',
            ];

            // Wait up to 15 seconds for loader to disappear
            for (let i = 0; i < 15; i++) {
                let loaderVisible = false;

                for (const selector of loaderSelectors) {
                    try {
                        const loader = this.page.locator(selector).first();
                        if (await loader.isVisible({ timeout: 500 })) {
                            loaderVisible = true;
                            break;
                        }
                    } catch {
                        continue;
                    }
                }

                if (!loaderVisible) {
                    console.log('   ✅ Loader finished');
                    break;
                }

                // Wait 1 second before checking again
                await delay(1000);
                process.stdout.write('.');
            }
            console.log(''); // New line after dots

            // Extra wait for Angular to render the data
            await delay(2000);

            // Look for the slot text
            const slotSelectors = [
                'text=/Earliest available slot/i',
                '*:has-text("Earliest available slot")',
                '.slot-info',
                '[class*="earliest"]',
            ];

            for (const selector of slotSelectors) {
                try {
                    const element = this.page.locator(selector).first();
                    if (await element.isVisible({ timeout: 2000 })) {
                        const text = await element.textContent();
                        if (text && text.includes('Earliest available slot')) {
                            // Extract the date using regex
                            const dateMatch = text.match(/(\d{2}-\d{2}-\d{4})/);
                            if (dateMatch) {
                                const date = dateMatch[1];
                                console.log(`   🎯 Found slot date: ${date}`);
                                return date;
                            }
                            // Return full text if date pattern not found
                            console.log(`   📝 Found slot text: ${text.trim()}`);
                            return text.trim();
                        }
                    }
                } catch {
                    continue;
                }
            }

            // Fallback: search entire page content for the pattern
            const pageContent = await this.page.textContent('body');
            if (pageContent) {
                const slotMatch = pageContent.match(/Earliest available slot.*?:\s*(\d{2}-\d{2}-\d{4})/i);
                if (slotMatch) {
                    console.log(`   🎯 Found slot date (from page): ${slotMatch[1]}`);
                    return slotMatch[1];
                }
            }

            console.log('   ⚠️ No slot information found yet');
            return null;
        } catch (error) {
            console.log('   ❌ Error detecting slot:', error);
            return null;
        }
    }

    /**
     * Click the Continue button after selecting appointment details
     * Button is inside mat-card with class btn-brand-orange
     */
    private async clickContinueButton(): Promise<boolean> {
        try {
            // Wait a bit for the button to be ready
            await delay(2000);

            const buttonSelectors = [
                // From user's DOM inspection
                'mat-card button.btn-brand-orange',
                'button:has(span.mdc-button__label:has-text("Continue"))',
                'button.btn-brand-orange:has-text("Continue")',
                // Generic Continue button
                'button:has-text("Continue")',
                'button.mdc-button--raised:has-text("Continue")',
            ];

            let button: Locator | null = null;

            for (const selector of buttonSelectors) {
                try {
                    const candidate = this.page.locator(selector).first();
                    if (await candidate.isVisible({ timeout: 3000 })) {
                        const text = await candidate.textContent().catch(() => '');
                        if (text?.toLowerCase().includes('continue')) {
                            button = candidate;
                            console.log(`   ✅ Found Continue button with: ${selector}`);
                            break;
                        }
                    }
                } catch {
                    continue;
                }
            }

            if (!button) {
                console.log('   ❌ Continue button not found');
                return false;
            }

            // Natural click with human behavior
            await this.behavior.naturalClick(button);
            console.log('   ✅ Clicked Continue');

            // Wait for navigation
            await delay(2000);

            return true;
        } catch (error) {
            console.log('   ❌ Failed to click Continue:', error);
            return false;
        }
    }

    /**
     * Wait for Your Details page to load
     * URL: https://visa.vfsglobal.com/are/en/mlt/your-details
     */
    private async waitForYourDetailsPage(): Promise<boolean> {
        try {
            console.log('   ⏳ Waiting for Your Details page...');

            // Wait for URL to change
            await this.page.waitForURL('**/your-details', { timeout: 30000 });
            console.log('   📍 URL confirmed: your-details page');

            // Wait for page content to load
            await delay(2000);

            // Check for "Your Details" heading or form elements
            const pageContent = await this.page.textContent('body').catch(() => '');

            if (pageContent?.includes('Your Details') || pageContent?.includes('Applicant')) {
                console.log('   ✅ Your Details page loaded');

                // Check for the 13-second warning
                if (pageContent?.includes('Please wait 13 seconds')) {
                    console.log('   ⏳ Waiting 15 seconds as requested by page...');
                    await delay(2000);
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
            await delay(2000);

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
            // NATIONALITY (Dropdown)
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Selecting Nationality...');
            await this.selectNationality(applicant.nationality);

            // ═══════════════════════════════════════════════════════════
            // PASSPORT NUMBER
            // ═══════════════════════════════════════════════════════════
            console.log('   📝 Filling Passport Number...');
            const passportInput = this.page.locator('input[placeholder*="passport" i], input[formcontrolname*="passport" i]').first();
            if (await passportInput.isVisible({ timeout: 3000 })) {
                await this.behavior.robustFill(passportInput, applicant.passportNumber, 'Passport Number');
            } else {
                console.log('   ⚠️ Passport Number field not found');
            }

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

                // First check if already selected
                const currentValue = await this.page.locator('mat-form-field:has-text("Nationality") .mat-mdc-select-value-text, mat-select#mat-select-3 .mat-mdc-select-value-text').first().textContent().catch(() => '');
                if (currentValue?.toUpperCase().includes(nationalityUpper)) {
                    console.log(`   ✅ Nationality already selected: ${currentValue}`);
                    return true;
                }

                // Find and click the nationality dropdown
                const dropdownSelectors = [
                    'mat-form-field:has-text("Nationality") mat-select',
                    'mat-form-field:has-text("Current Nationality") mat-select',
                    'mat-select#mat-select-3',
                    'app-input-control:has-text("Nationality") mat-select',
                    // More generic - find the 3rd or 4th mat-select on the page
                    'mat-select:nth-of-type(3)',
                ];

                let dropdownClicked = false;
                let dropdown: Locator | null = null;

                for (const selector of dropdownSelectors) {
                    try {
                        const d = this.page.locator(selector).first();
                        if (await d.isVisible({ timeout: 1000 })) {
                            dropdown = d;
                            // Direct click only (no naturalClick - causes scrolling)
                            await d.click({ force: true });
                            dropdownClicked = true;
                            console.log(`   ✅ Clicked dropdown: ${selector}`);
                            break;
                        }
                    } catch {
                        continue;
                    }
                }

                if (!dropdownClicked) {
                    console.log('   ⚠️ Could not find nationality dropdown, clicking outside to reset...');
                    // Click outside to close any open overlay/dropdown
                    await this.page.click('body', { position: { x: 100, y: 100 } });
                    await delay(500);
                    continue;
                }

                // Wait for panel to open
                await delay(500);

                // Check if panel is visible
                const panelVisible = await this.page.locator('#mat-select-3-panel mat-option, .cdk-overlay-container mat-option').first().isVisible({ timeout: 3000 }).catch(() => false);

                if (!panelVisible) {
                    console.log('   ⚠️ Panel not visible, clicking dropdown again...');
                    if (dropdown) {
                        await dropdown.click({ force: true });
                        await delay(300);
                    }
                }

                // Now try to find and click the option
                // Strategy 1: Direct text match
                console.log(`   🔍 Looking for option: "${nationalityUpper}"...`);

                const exactOption = this.page.locator(`mat-option:has(span:text-is("${nationalityUpper}"))`).first();
                if (await exactOption.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await exactOption.click();
                    console.log(`   ✅ Clicked exact match option`);
                    await delay(300);

                    // Verify selection
                    if (await this.verifyNationalitySelected(nationalityUpper)) {
                        return true;
                    }
                }

                // Strategy 2: Contains text match
                const containsOption = this.page.locator(`mat-option:has-text("${nationalityUpper}")`).first();
                if (await containsOption.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await containsOption.click();
                    console.log(`   ✅ Clicked contains match option`);
                    await delay(300);

                    if (await this.verifyNationalitySelected(nationalityUpper)) {
                        return true;
                    }
                }

                // Strategy 3: Iterate through all visible options
                const allOptions = await this.page.locator('.cdk-overlay-container mat-option, #mat-select-3-panel mat-option').all();
                console.log(`   📋 Found ${allOptions.length} options in panel`);

                for (const opt of allOptions) {
                    try {
                        const optText = await opt.textContent();
                        const cleanText = optText?.trim().toUpperCase() || '';

                        if (cleanText === nationalityUpper || cleanText.includes(nationalityUpper)) {
                            console.log(`   🎯 Found matching option: "${cleanText}"`);

                            // Scroll into view first
                            await opt.scrollIntoViewIfNeeded();
                            await delay(2000);

                            // Click it
                            await opt.click();
                            console.log(`   ✅ Clicked option`);
                            await delay(2000);

                            if (await this.verifyNationalitySelected(nationalityUpper)) {
                                return true;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Close dropdown before retry
                await this.page.keyboard.press('Escape');
                await delay(2000);

            } catch (error) {
                console.log(`   ⚠️ Attempt ${attempt} failed:`, error);
                await this.page.keyboard.press('Escape').catch(() => { });
            }

            if (attempt < maxRetries) {
                console.log('   🔄 Retrying nationality selection...');
                await delay(2000);
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
            await delay(300);

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
                // From user's DOM inspection - exact match
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
                        await delay(2000);

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
                        await delay(2000);

                        // Check for captcha popup
                        await this.checkAndHandleCaptcha();

                        // Check if page changed (URL or content)
                        const pageContent = await this.page.textContent('body').catch(() => '');
                        if (pageContent?.includes('Your Details Summary') ||
                            (pageContent?.includes('Applicant 1') && pageContent?.includes('Add another'))) {
                            console.log('   ✅ Save successful - Summary page detected');
                            await delay(2000);
                            return true;
                        }

                        // If still on same page, try force click
                        console.log('   🔄 Retrying with force click...');
                        await button.click({ force: true });
                        await delay(2000);

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
                    await delay(2000);
                }

                // Maybe we're still on the form page - check for Save button
                const saveVisible = await this.page.locator('button:has-text("Save")').isVisible().catch(() => false);
                if (saveVisible) {
                    console.log('   ⚠️ Still on form page - Save may not have worked');
                    return false;
                }
            }

            // Wait a bit for animations
            await delay(2000);

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
                        await delay(2000);

                        // Click Continue button 3 times (handles popup case)
                        for (let clickNum = 1; clickNum <= 3; clickNum++) {
                            try {
                                const btn = this.page.locator('button:has-text("Continue")').first();
                                if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                                    await btn.click({ force: true });
                                    console.log(`   ✅ Clicked Continue (${clickNum}/3)`);
                                    await delay(1000);
                                }
                            } catch {
                                break;
                            }
                        }

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
                await delay(2000);
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
     * Sometimes there are 2 Continue buttons to click (popup case)
     */
    async waitForBookAppointmentPage(): Promise<boolean> {
        console.log('\n📅 Waiting for Book Appointment page...');

        try {
            // Click Continue buttons - there may be 2 (popup case)
            for (let clickAttempt = 1; clickAttempt <= 2; clickAttempt++) {
                const currentUrl = this.page.url();

                // If already on appointment page, we're done
                if (currentUrl.includes('/book-appointment')) {
                    console.log('   ✅ Book Appointment page loaded');
                    return true;
                }

                // If still on summary, click Continue
                if (currentUrl.includes('/summary')) {
                    console.log(`   🔄 Still on Summary (attempt ${clickAttempt}/2), clicking Continue...`);

                    const continueBtn = this.page.locator('button:has-text("Continue")').first();
                    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                        await continueBtn.click({ force: true });
                        console.log('   ✅ Clicked Continue');

                        // Wait for navigation
                        await delay(3000);
                    } else {
                        console.log('   ⚠️ Continue button not visible');
                        await delay(2000);
                    }
                }
            }

            // Final wait and URL check
            await delay(5000);
            const finalUrl = this.page.url();

            if (finalUrl.includes('/book-appointment')) {
                console.log('   ✅ Book Appointment page loaded (verified by URL)');
                return true;
            }

            // If still on summary, try one more time
            if (finalUrl.includes('/summary')) {
                console.log('   🔄 Still on Summary after 2 attempts, trying force click...');
                const anyButton = this.page.locator('button:has-text("Continue")').first();
                if (await anyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await anyButton.click({ force: true });
                    await delay(3000);
                }

                // Check URL one more time
                const verifyUrl = this.page.url();
                if (verifyUrl.includes('/book-appointment')) {
                    console.log('   ✅ Book Appointment page loaded (after retry)');
                    return true;
                }
            }

            console.log(`   ❌ Could not navigate to Book Appointment page. Current URL: ${finalUrl}`);
            return false;
        } catch (error) {
            console.log('   ❌ Error waiting for Book Appointment page:', error);
            return false;
        }
    }
}

