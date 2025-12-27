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
     * Telegram notification settings
     */
    telegram: {
        enabled: boolean;
        botToken: string;
        chatId: string;
    };

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
        { email: 'ahammedx5@mailnesia.com', password: 'Trav@123' },
        { email: 'ahammedx4@mailnesia.com', password: 'Trav@123' },
    ],

    // Check slot this many times per login (default: 5)
    slotsPerLogin: 5,

    // Wait this many minutes between account cycles (default: 12)
    intervalMinutes: 12,

    // Telegram settings
    telegram: {
        enabled: true,  // Set to true to enable
        botToken: '8380612073:AAEEaPY_XMcJlsck_yzB2a8SN7cheXd10oE',  // Get from @BotFather
        chatId: '-1003568600391',       // Your Telegram chat ID
    },

    // VFS sub-category
    subCategory: 'tourism',

    // Browser settings
    headless: false,  // false = show browser window
    screenshots: true,
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
