/**
 * Human-Indistinguishable Web Automation System
 * 
 * CORE PHILOSOPHY:
 * "The system does not attempt to bypass security mechanisms.
 * Instead, it removes all non-human signals by behaving exactly like
 * a real browser operated by a real user."
 * 
 * ONE-LINE SUMMARY:
 * "I don't bypass security. I design automation that never gives security a reason to react."
 * 
 * @module human-indistinguishable-automation
 */


import { BrowserIdentityManager } from './core/browser-identity.js';
import { VFSLoginFlow } from './flows/vfs-login.js';
import { VFSBookingFlow } from './flows/vfs-booking.js';
import { VFSAppointmentFlow } from './flows/vfs-appointment.js';
import { EnvironmentMonitor } from './core/environment-monitor.js';
import { loopConfig, validateConfig } from './config/loop-config.js';

/**
 * Configuration from centralized config
 */
interface AutomationConfig {
    email: string;
    password: string;
    headless: boolean;
    profileId: string;
    subCategory: string;
    proxy?: {
        server: string;
        username?: string;
        password?: string;
    };
}

function loadConfig(): AutomationConfig {
    // Parse command line arguments for overrides (optional)
    const args = process.argv.slice(2);
    // const headless = args.includes('--headless'); // Use config value primarily

    if (!validateConfig()) {
        process.exit(1);
    }

    const primaryAccount = loopConfig.accounts[0];

    return {
        email: primaryAccount.email,
        password: primaryAccount.password,
        headless: loopConfig.headless,
        profileId: 'vfs-user-default',
        subCategory: loopConfig.subCategory,
        proxy: undefined, // Proxy support removed/not in loopConfig
    };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║   HUMAN-INDISTINGUISHABLE WEB AUTOMATION SYSTEM              ║');
    console.log('║   VFS Global Italy Visa Login                                ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║   Core Philosophy:                                           ║');
    console.log('║   "Remove all non-human signals by behaving exactly like     ║');
    console.log('║    a real browser operated by a real user."                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const config = loadConfig();

    // Validate credentials
    if (!config.email || !config.password) {
        console.error('❌ Error: No accounts configured in loop-config.ts');
        process.exit(1);
    }

    console.log(`📋 Configuration:`);
    console.log(`   Mode: ${config.headless ? 'Headless' : 'Headed'}`);
    console.log(`   Profile: ${config.profileId}`);
    console.log(`   Email: ${config.email.replace(/(.{3}).*(@.*)/, '$1***$2')}`);
    if (config.proxy) {
        console.log(`   🌐 Proxy: ${config.proxy.server}`);
    }
    console.log('');

    // Initialize browser with persistent identity
    const identity = new BrowserIdentityManager({
        profileId: config.profileId,
        headless: config.headless,
        persistSession: true,
        profilesDir: './browser-profiles',
        proxy: config.proxy,
    });

    let exitCode = 0;

    try {
        // Check if this is a warm session
        if (identity.isWarmSession()) {
            console.log('🔥 Warm session detected - reusing existing browser state\n');
        } else {
            console.log('🆕 Cold start - initializing fresh browser profile\n');
        }

        // Launch browser with consistent identity
        const { browser, context, page } = await identity.launch();

        // Execute login flow
        const loginFlow = new VFSLoginFlow(page, {
            loginUrl: 'https://visa.vfsglobal.com/are/en/jpn/login',
            screenshotOnError: true,
        });

        const result = await loginFlow.execute({
            email: config.email,
            password: config.password,
        });

        // Report result
        console.log('\n' + '═'.repeat(60));
        console.log('📊 RESULT SUMMARY');
        console.log('═'.repeat(60));
        console.log(`   Success: ${result.success ? '✅ Yes' : '❌ No'}`);
        console.log(`   State: ${result.state}`);
        console.log(`   Message: ${result.message}`);

        if (result.retryAfter) {
            console.log(`   Suggested Wait: ${EnvironmentMonitor.formatWaitTime(result.retryAfter)}`);
        }
        console.log('═'.repeat(60) + '\n');

        // Handle different states
        if (result.success) {
            console.log('🎉 Login successful! Proceeding to booking flow...\n');

            // Execute booking flow
            const bookingFlow = new VFSBookingFlow(page, {
                subCategory: config.subCategory,
            });

            const bookingResult = await bookingFlow.execute();

            console.log('\n' + '═'.repeat(60));
            console.log('📋 BOOKING RESULT');
            console.log('═'.repeat(60));
            console.log(`   Success: ${bookingResult.success ? '✅ Yes' : '❌ No'}`);
            console.log(`   State: ${bookingResult.state}`);
            console.log(`   Message: ${bookingResult.message}`);
            if (bookingResult.earliestSlot) {
                console.log('');
                console.log('   🗓️  ╔════════════════════════════════════════════╗');
                console.log(`   🗓️  ║  EARLIEST SLOT: ${bookingResult.earliestSlot.padEnd(25)} ║`);
                console.log('   🗓️  ╚════════════════════════════════════════════╝');
            }
            console.log('═'.repeat(60) + '\n');

            // If we reached the book_appointment page, continue with appointment flow
            if (bookingResult.state === 'book_appointment') {
                console.log('📅 Proceeding to appointment selection...\n');

                const appointmentFlow = new VFSAppointmentFlow(page);
                const appointmentResult = await appointmentFlow.execute();

                console.log('\n' + '═'.repeat(60));
                console.log('📅 APPOINTMENT RESULT');
                console.log('═'.repeat(60));
                console.log(`   Success: ${appointmentResult.success ? '✅ Yes' : '❌ No'}`);
                console.log(`   State: ${appointmentResult.state}`);
                console.log(`   Message: ${appointmentResult.message}`);
                if (appointmentResult.appointmentDate) {
                    console.log(`   📆 Date: ${appointmentResult.appointmentDate}`);
                }
                if (appointmentResult.appointmentTime) {
                    console.log(`   ⏰ Time: ${appointmentResult.appointmentTime}`);
                }
                console.log('═'.repeat(60) + '\n');
            }

            // Keep browser open for manual inspection (in headed mode)
            if (!config.headless) {
                console.log('🖥️  Browser will remain open for inspection.');
                console.log('   Press Ctrl+C to close.\n');
                await new Promise(() => { }); // Wait indefinitely
            }
        } else if (result.state === 'blocked' || result.state === 'maintenance') {
            console.log('⏳ Environment issue detected. Please wait and retry later.');
            exitCode = 2;
        } else if (result.state === 'captcha_required') {
            console.log('🤖 CAPTCHA required. Manual intervention needed.');
            if (!config.headless) {
                console.log('   Complete the CAPTCHA manually in the browser window.');
                await new Promise(() => { });
            }
            exitCode = 3;
        } else {
            console.log('❌ Login result unclear. Browser will remain open for inspection.');
            console.log('   Check the browser to see what happened after form submission.');
            console.log('   Press Ctrl+C to close.\n');

            // Keep browser open so user can see the result
            if (!config.headless) {
                await new Promise(() => { }); // Wait indefinitely
            }
            exitCode = 1;
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
        exitCode = 1;
    } finally {
        await identity.close();
    }

    process.exit(exitCode);
}

// Execute
main().catch(console.error);
