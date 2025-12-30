/**
 * Loop Configuration
 * 
 * Central config for multi-account slot checking loop.
 * Edit this file to configure accounts, intervals, and Telegram.
 */

export interface AccountCredentials {
    email: string;
    password: string;
}

export interface LoopConfig {
    /**
     * Mode:
     * - 'earliest_slot': Check slot only, send notification, go back to dashboard
     * - 'full_scenario': Complete booking flow (select date, time, fill form, etc.)
     */
    mode: 'earliest_slot' | 'full_scenario';

    /**
     * Account credentials (2-3 accounts to rotate)
     */
    accounts: AccountCredentials[];

    /**
     * How many times to check slot per login session (default: 5)
     */
    slotsPerLogin: number;

    /**
     * Interval between login cycles in minutes (default: 10-15)
     */
    intervalMinutes: number;

    /**
     * Strict Schedule: Run only at specific minutes of the hour (e.g. 29, 59)
     * If enabled, 'intervalMinutes' is ignored.
     */
    schedule?: {
        enabled: boolean;
        minutes: number[]; // e.g. [29, 59]
    };

    /**
     * Telegram notification settings
     */
    telegram: {
        enabled: boolean;
        botToken: string;
        chatId: string;
    };

    /**
     * Gmail settings for OTP fetching (VFS Italy)
     */
    gmail: {
        enabled: boolean;
        user: string;        // Your Gmail address
        appPassword: string; // Gmail App Password (16 characters)
    };

    /**
     * Rotate AWS IP after each account cycle
     */
    rotateIP?: boolean;

    /**
     * VFS booking sub-category
     */
    subCategory: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family';

    /**
     * Run in headless mode (false = show browser)
     */
    headless: boolean;

    /**
     * Take screenshots during slot check
     */
    screenshots: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════
 *                    CONFIGURATION
 *               Edit the values below
 * ═══════════════════════════════════════════════════════════
 */
export const loopConfig: LoopConfig = {
    // Mode: 'earliest_slot' (quick check) or 'full_scenario' (complete booking)
    mode: 'earliest_slot',

    // Account credentials - add 2-3 accounts
    accounts: [
        { email: 'carlomaria198711@gmail.com', password: 'Anypassw0rd@' },
    ],

    // Check slot this many times per login (default: 5)
    slotsPerLogin: 3,

    // Wait this many minutes between account cycles (default: 12)
    intervalMinutes: 12,

    // Strict Schedule: Run only at these minutes (e.g. XX:29, XX:59)
    // If enabled, intervalMinutes is ignored.
    schedule: {
        enabled: true,
        minutes: [29, 59],
    },

    // Telegram settings
    telegram: {
        enabled: true,  // Set to true to enable
        botToken: '8380612073:AAEEaPY_XMcJlsck_yzB2a8SN7cheXd10oE',  // Get from @BotFather
        chatId: '-1003422302979',       // Your Telegram chat ID
    },

    // Gmail settings for OTP (VFS Italy)
    gmail: {
        enabled: true,  // Set to true to enable OTP fetching
        user: 'carlomaria198711@gmail.com',  // Your Gmail address
        appPassword: 'mctm somb ortc pulv',  // Gmail App Password (16 chars)
    },

    // VFS sub-category
    subCategory: 'tourism',

    // Browser settings
    headless: true,  // false = show browser window
    screenshots: true,

    // AWS IP Rotation (Enable ONLY on AWS EC2 with IAM Role)
    rotateIP: true,
};

/**
 * Get config - use this function to access config
 */
export function getLoopConfig(): LoopConfig {
    return { ...loopConfig };
}

/**
 * Validate config on load
 */
export function validateConfig(): boolean {
    if (loopConfig.accounts.length === 0) {
        console.error('❌ No accounts configured in loop-config.ts');
        return false;
    }

    for (const acc of loopConfig.accounts) {
        if (!acc.email || !acc.password) {
            console.error('❌ Invalid account credentials in loop-config.ts');
            return false;
        }
    }

    if (loopConfig.slotsPerLogin < 1) {
        console.error('❌ slotsPerLogin must be at least 1');
        return false;
    }

    if (loopConfig.intervalMinutes < 1) {
        console.error('❌ intervalMinutes must be at least 1');
        return false;
    }

    return true;
}
