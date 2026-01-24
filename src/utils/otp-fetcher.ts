/**
 * Unified OTP Fetcher
 * 
 * Automatically detects email domain and fetches OTP from the appropriate source:
 * - @gmail.com -> Gmail IMAP
 * - @mailnesia.com -> Mailnesia web scraping
 */

import { fetchOTPFromGmail, waitForOTP as waitForGmailOTP, type GmailConfig } from './gmail-otp.js';
import { fetchOTPFromMailnesia, waitForMailnesiaOTP, type MailnesiaConfig } from './mailnesia-otp.js';

export interface OTPConfig {
    email: string;
    password: string;  // Gmail App Password for Gmail, account password for Mailnesia
}

/**
 * Detect email provider from email address
 */
function getEmailProvider(email: string): 'gmail' | 'mailnesia' | 'unknown' {
    const domain = email.split('@')[1]?.toLowerCase();

    if (domain === 'gmail.com') {
        return 'gmail';
    } else if (domain === 'mailnesia.com') {
        return 'mailnesia';
    }

    return 'unknown';
}

/**
 * Unified OTP fetcher - automatically routes to correct provider
 * @param config Email and password configuration
 * @param maxAgeMinutes How old the email can be (default: 5 minutes)
 * @returns OTP code or null if not found
 */
export async function fetchOTP(
    config: OTPConfig,
    maxAgeMinutes: number = 5
): Promise<string | null> {
    const provider = getEmailProvider(config.email);

    console.log(`📧 Fetching OTP for ${config.email} (Provider: ${provider.toUpperCase()})`);

    switch (provider) {
        case 'gmail':
            const gmailConfig: GmailConfig = {
                user: config.email,
                password: config.password
            };
            return await fetchOTPFromGmail(gmailConfig, maxAgeMinutes);

        case 'mailnesia':
            const mailnesiaConfig: MailnesiaConfig = {
                email: config.email,
                password: config.password
            };
            return await fetchOTPFromMailnesia(mailnesiaConfig, maxAgeMinutes);

        default:
            console.log(`   ❌ Unsupported email provider: ${config.email}`);
            console.log(`   💡 Supported providers: Gmail (@gmail.com), Mailnesia (@mailnesia.com)`);
            return null;
    }
}

/**
 * Wait for OTP with retry logic - automatically routes to correct provider
 * @param config Email and password configuration
 * @param maxRetries Maximum number of retries (default: 6)
 * @param retryDelayMs Delay between retries in ms (default: 10000 = 10s)
 * @returns OTP code or null
 */
export async function waitForOTP(
    config: OTPConfig,
    maxRetries: number = 6,
    retryDelayMs: number = 10000
): Promise<string | null> {
    const provider = getEmailProvider(config.email);

    console.log(`   ⏳ Waiting for OTP from ${provider.toUpperCase()} (max ${maxRetries * retryDelayMs / 1000}s)...`);

    switch (provider) {
        case 'gmail':
            const gmailConfig: GmailConfig = {
                user: config.email,
                password: config.password
            };
            return await waitForGmailOTP(gmailConfig, maxRetries, retryDelayMs);

        case 'mailnesia':
            const mailnesiaConfig: MailnesiaConfig = {
                email: config.email,
                password: config.password
            };
            return await waitForMailnesiaOTP(mailnesiaConfig, maxRetries, retryDelayMs);

        default:
            console.log(`   ❌ Unsupported email provider: ${config.email}`);
            return null;
    }
}

// Export types for backward compatibility
export type { GmailConfig } from './gmail-otp.js';
export type { MailnesiaConfig } from './mailnesia-otp.js';
