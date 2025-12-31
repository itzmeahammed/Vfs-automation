
import { Page, Locator } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
    HumanTimingEngine,
    BehaviorSimulator,
} from '../core/index.js';
import { ApplicantDetails } from '../config/applicant-config.js';
import { delay } from '../config/timing-config.js';

/**
 * VFS Your Details Flow
 * 
 * Handles the "Your Details" page:
 * 1. File Upload (Passport)
 * 2. Auto-fill wait
 * 3. Manual Address Entry
 */
export class VFSYourDetailsFlow {
    private page: Page;
    private timing: HumanTimingEngine;
    private behavior: BehaviorSimulator;

    constructor(page: Page) {
        this.page = page;
        this.timing = new HumanTimingEngine();
        this.behavior = new BehaviorSimulator(page, this.timing);
    }

    /**
     * Execute the "Your Details" flow
     */
    async execute(applicant: ApplicantDetails): Promise<boolean> {
        console.log('\n' + '═'.repeat(60));
        console.log('📝 Handling "Your Details" Page');
        console.log('═'.repeat(60));

        try {
            // 1. Handle File Upload
            const uploadSuccess = await this.handleFileUpload();
            if (!uploadSuccess) return false;

            // 2. Wait for auto-fill (triggered by "Continue" from upload section)
            // Note: In this specific flow, uploading + clicking continue triggers the form fill
            console.log('\n   ⏳ Waiting for form auto-fill...');
            await this.waitForAutoFill();

            // 3. Fill Manual Details (Address)
            const addressSuccess = await this.fillAddressDetails(applicant);
            if (!addressSuccess) return false;

            // 4. Click Save
            return await this.clickSaveButton();

        } catch (error) {
            console.error('❌ Error in Your Details flow:', error);
            return false;
        }
    }

    /**
     * Handle Passport File Upload
     */
    private async handleFileUpload(): Promise<boolean> {
        console.log('\n   📂 Starting File Upload...');

        // 1. Find a file in passport/ directory
        const passportDir = path.resolve(process.cwd(), 'passport');
        if (!fs.existsSync(passportDir)) {
            console.error('   ❌ "passport" directory not found!');
            return false;
        }

        const files = fs.readdirSync(passportDir).filter(f =>
            ['.jpg', '.jpeg', '.png', '.pdf'].includes(path.extname(f).toLowerCase())
        );

        if (files.length === 0) {
            console.error('   ❌ No files found in "passport" directory (jpg, png, pdf)');
            return false;
        }

        const filePath = path.join(passportDir, files[0]);
        console.log(`   📄 Selected file: ${files[0]}`);

        try {
            // 2. Locate the upload container/input
            // Selector provided by user: /html/body/app-root/div/main/div/app-applicant-details/section/mat-card[1]/app-file-upload/div/div/div/div/div
            const uploadContainerSelector = 'xpath=/html/body/app-root/div/main/div/app-applicant-details/section/mat-card[1]/app-file-upload/div/div/div/div/div';

            // We need the input[type="file"] inside or related to this container
            // Usually hidden, so we look for it generally or create a chooser

            const fileInput = this.page.locator('input[type="file"]').first();

            if (await fileInput.count() > 0) {
                await fileInput.setInputFiles(filePath);
                console.log('   ✅ File input set directly');
            } else {
                // Fallback: Click container and expect file chooser
                console.log('   Clicking upload container to open chooser...');
                const fileChooserPromise = this.page.waitForEvent('filechooser', { timeout: 5000 });
                await this.page.click(uploadContainerSelector, { force: true });
                const fileChooser = await fileChooserPromise;
                await fileChooser.setFiles(filePath);
                console.log('   ✅ File chosen via dialog');
            }

            // Wait for upload processing (usually a progress bar or status change)
            await delay(2000);

            // 3. Click the specific "Continue" button for the upload section
            // Selector: /html/body/app-root/div/main/div/app-applicant-details/section/mat-card[1]/app-file-upload/div/div/div/div/div[2]/div[2]/button[1]
            const uploadContinueSelector = 'xpath=/html/body/app-root/div/main/div/app-applicant-details/section/mat-card[1]/app-file-upload/div/div/div/div/div[2]/div[2]/button[1]';

            const continueBtn = this.page.locator(uploadContinueSelector);
            if (await continueBtn.isVisible({ timeout: 5000 })) {
                await this.behavior.naturalClick(continueBtn);
                console.log('   ✅ Clicked "Continue" after upload');
                return true;
            } else {
                console.error('   ❌ Upload "Continue" button not found');
                return false;
            }

        } catch (error) {
            console.error('   ❌ File upload failed:', error);
            return false;
        }
    }

    /**
     * Wait for form to contain data
     */
    private async waitForAutoFill(): Promise<void> {
        // Wait until First Name field has a value
        const firstNameInput = this.page.locator('input[formcontrolname="firstName"], input[name="firstName"]').first();

        try {
            await firstNameInput.waitFor({ state: 'visible', timeout: 10000 });

            // Poll for value
            for (let i = 0; i < 20; i++) {
                const val = await firstNameInput.inputValue();
                if (val && val.length > 0) {
                    console.log('   ✅ Auto-fill detected');
                    return;
                }
                await delay(500);
            }
            console.log('   ⚠️ Auto-fill timeout, proceeding anyway...');
        } catch {
            console.log('   ⚠️ Could not detect auto-fill');
        }
    }

    /**
     * Fill Manual Address Details
     */
    private async fillAddressDetails(applicant: ApplicantDetails): Promise<boolean> {
        console.log('\n   ✍️ Filling Address Details...');

        try {
            // Fields to fill
            const fields = [
                { label: 'Address Line 1', value: applicant.addressLine1, selector: 'input[formcontrolname="addressLine1"], input[placeholder*="Address line 1"]' },
                { label: 'Address Line 2', value: applicant.addressLine2, selector: 'input[formcontrolname="addressLine2"], input[placeholder*="Address line 2"]' },
                { label: 'State', value: applicant.state, selector: 'input[formcontrolname="state"], input[placeholder*="State"]' },
                { label: 'City', value: applicant.city, selector: 'input[formcontrolname="city"], input[placeholder*="City"]' },
                { label: 'Postcode', value: applicant.postcode, selector: 'input[formcontrolname="zipCode"], input[placeholder*="Postcode"]' }
            ];

            for (const field of fields) {
                if (!field.value) continue; // Skip empty optional fields

                const input = this.page.locator(field.selector).first();
                if (await input.isVisible()) {
                    await input.scrollIntoViewIfNeeded();
                    await this.behavior.naturalType(input, field.value);
                    console.log(`   ✅ Filled ${field.label}`);
                } else {
                    console.log(`   ⚠️ Could not find field: ${field.label}`);
                }
                await delay(300);
            }

            return true;
        } catch (error) {
            console.error('   ❌ Error filling address:', error);
            return false;
        }
    }

    /**
     * Click Main Save Button
     */
    private async clickSaveButton(): Promise<boolean> {
        try {
            const saveBtn = this.page.locator('button:has-text("Save")').last(); // Usually at bottom
            if (await saveBtn.isVisible()) {
                await saveBtn.scrollIntoViewIfNeeded();
                await this.behavior.naturalClick(saveBtn);
                console.log('   ✅ Clicked "Save"');
                return true;
            }
            console.error('   ❌ "Save" button not found');
            return false;
        } catch (error) {
            console.error('   ❌ Error clicking Save:', error);
            return false;
        }
    }
}
