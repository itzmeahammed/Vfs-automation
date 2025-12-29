/**
 * Gmail OTP Fetcher
 * 
 * Fetches OTP codes from Gmail using IMAP.
 * Requires Gmail App Password (not your regular password).
 */

import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

export interface GmailConfig {
    user: string;
    password: string; // Gmail App Password
}

/**
 * Fetch OTP from most recent VFS Global email
 * @param gmailConfig Gmail credentials
 * @param maxAgeMinutes How old the email can be (default: 2 minutes)
 * @returns OTP code or null if not found
 */
export async function fetchOTPFromGmail(
    gmailConfig: GmailConfig,
    maxAgeMinutes: number = 2
): Promise<string | null> {
    console.log('📧 Connecting to Gmail to fetch OTP...');

    const config = {
        imap: {
            user: gmailConfig.user,
            password: gmailConfig.password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 10000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    let connection: any = null;

    try {
        // Connect to Gmail
        connection = await imaps.connect(config);
        console.log('   ✅ Connected to Gmail');

        // Open Inbox
        await connection.openBox('INBOX');
        console.log('   ✅ Opened Inbox');

        // Calculate search date (maxAgeMinutes ago)
        const searchDate = new Date();
        searchDate.setMinutes(searchDate.getMinutes() - maxAgeMinutes);
        const searchDateStr = searchDate.toISOString().split('T')[0]; // YYYY-MM-DD

        // Try multiple search strategies
        console.log(`   🔍 Searching for VFS emails since ${searchDateStr}...`);

        // Strategy 1: Exact sender
        let searchCriteria: any[] = [
            ['FROM', 'donoreply@vfsglobal.com'],
            ['SINCE', searchDateStr]
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false
        };

        let messages = await connection.search(searchCriteria, fetchOptions).catch(() => []);
        console.log(`   📊 Strategy 1 (exact): Found ${messages?.length || 0} emails`);

        // Strategy 2: Broader domain search if no results
        if (!messages || messages.length === 0) {
            console.log('   🔄 Trying broader search (vfsglobal.com)...');
            searchCriteria = [
                ['FROM', 'vfsglobal.com'],
                ['SINCE', searchDateStr]
            ];
            messages = await connection.search(searchCriteria, fetchOptions).catch(() => []);
            console.log(`   📊 Strategy 2 (domain): Found ${messages?.length || 0} emails`);
        }

        // Strategy 3: Subject-based search if still no results
        if (!messages || messages.length === 0) {
            console.log('   🔄 Trying subject search (One Time Password)...');
            searchCriteria = [
                ['SUBJECT', 'One Time Password'],
                ['SINCE', searchDateStr]
            ];
            messages = await connection.search(searchCriteria, fetchOptions).catch(() => []);
            console.log(`   📊 Strategy 3 (subject): Found ${messages?.length || 0} emails`);
        }

        // Strategy 4: Get ALL recent emails (last resort)
        if (!messages || messages.length === 0) {
            console.log('   🔄 Trying ALL recent emails...');
            searchCriteria = [['SINCE', searchDateStr]];
            messages = await connection.search(searchCriteria, fetchOptions).catch(() => []);
            console.log(`   📊 Strategy 4 (all): Found ${messages?.length || 0} emails`);

            // List first 10 senders for debugging
            if (messages && messages.length > 0) {
                console.log('   📋 Recent email senders:');
                for (let i = 0; i < Math.min(10, messages.length); i++) {
                    const msg = messages[i];
                    const header = msg.parts.find((p: any) => p.which === 'HEADER');
                    if (header) {
                        const parsed = await simpleParser(header.body);
                        console.log(`      ${i + 1}. From: ${parsed.from?.text || 'Unknown'} | Subject: ${parsed.subject}`);
                    }
                }
            }
        }

        if (!messages || messages.length === 0) {
            console.log('   ⚠️ No recent emails found in Inbox');
            console.log('   💡 Check if VFS email is in Spam folder');
            return null;
        }

        console.log(`   📬 Processing ${messages.length} email(s) for OTP...`);

        // Process messages (newest first)
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            const all = message.parts.find((part: any) => part.which === '');

            if (!all || !all.body) continue;

            // Parse email
            const parsed = await simpleParser(all.body);
            const subject = parsed.subject || '';
            const text = parsed.text || '';
            const html = parsed.html || '';

            console.log(`   📨 Email subject: ${subject}`);

            // Check if this is an OTP email from VFS
            if (subject.toLowerCase().includes('one time password') ||
                subject.toLowerCase().includes('otp') ||
                text.toLowerCase().includes('otp for your application with vfs')) {

                // Extract 6-digit OTP from text or HTML
                // VFS format: "The OTP for your application with VFS Global is 374839"
                const combinedText = text + ' ' + html;

                // Try VFS-specific pattern first
                let otpMatch = combinedText.match(/(?:is|:)\s*(\d{6})/);

                // Fallback to generic 6-digit pattern
                if (!otpMatch) {
                    otpMatch = combinedText.match(/\b(\d{6})\b/);
                }

                if (otpMatch) {
                    const otp = otpMatch[1];
                    console.log(`   ✅ OTP found: ${otp}`);
                    return otp;
                }
            }
        }

        console.log('   ⚠️ No OTP found in recent emails');
        return null;

    } catch (error) {
        console.log('   ❌ Gmail error:', error);
        return null;
    } finally {
        // Close connection
        if (connection) {
            try {
                connection.end();
                console.log('   ✅ Gmail connection closed');
            } catch (e) {
                // Ignore close errors
            }
        }
    }
}

/**
 * Wait for OTP email with retry logic
 * @param gmailConfig Gmail credentials
 * @param maxRetries Maximum number of retries (default: 6)
 * @param retryDelayMs Delay between retries in ms (default: 10000 = 10s)
 * @returns OTP code or null
 */
export async function waitForOTP(
    gmailConfig: GmailConfig,
    maxRetries: number = 6,
    retryDelayMs: number = 10000
): Promise<string | null> {
    console.log(`   ⏳ Waiting for OTP email (max ${maxRetries * retryDelayMs / 1000}s)...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`   🔄 Attempt ${attempt}/${maxRetries}...`);

        const otp = await fetchOTPFromGmail(gmailConfig, 5); // Check emails from last 5 minutes

        if (otp) {
            return otp;
        }

        if (attempt < maxRetries) {
            console.log(`   ⏳ Waiting ${retryDelayMs / 1000}s before retry...`);
            await new Promise(r => setTimeout(r, retryDelayMs));
        }
    }

    console.log('   ❌ OTP not received after maximum retries');
    return null;
}
