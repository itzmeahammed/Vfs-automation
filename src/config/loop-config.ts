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
     * If enabled, intervalMinutes is ignored.
     */
    schedule?: {
        enabled: boolean;
        minutes: number[]; // e.g. [29, 59]

        // Account mapping: Each account runs at its assigned minute
        accountMapping?: {
            enabled: boolean;
            mapping: number[];  // e.g. [29, 59] - mapping[i] is minute for account[i]
        };
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

    /**
     * Rotate AWS IP after each account cycle
     */
    rotateIP?: boolean;
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

    // Account credentials - 8 mailnesia accounts for 4-hour rotation
    accounts: [
        { email: 'ahammedx2@mailnesia.com', password: 'Trav@123' },  // Accounts 0,1 - Hour%4==0
        { email: 'ahammedx3@mailnesia.com', password: 'Trav@123' },
        { email: 'ahammedx4@mailnesia.com', password: 'Trav@123' },  // Accounts 2,3 - Hour%4==1
        { email: 'ahammedx5@mailnesia.com', password: 'Trav@123' },
        { email: 'ahammedx6@mailnesia.com', password: 'Trav@123' },  // Accounts 4,5 - Hour%4==2
        { email: 'ahammedx7@mailnesia.com', password: 'Trav@123' },
        { email: 'ahammedx8@mailnesia.com', password: 'Trav@123' },  // Accounts 6,7 - Hour%4==3
        { email: 'ahammedx9@mailnesia.com', password: 'Trav@123' },
    ],

    // Check slot this many times per login (default: 5)
    slotsPerLogin: 5,

    // Wait this many minutes between account cycles (default: 12)
    intervalMinutes: 12,

    // Strict Schedule: 4-HOUR ROTATION
    // Hour%4==0 (0,4,8,12,16,20): x2 at :29, x3 at :59
    // Hour%4==1 (1,5,9,13,17,21): x4 at :29, x5 at :59
    // Hour%4==2 (2,6,10,14,18,22): x6 at :29, x7 at :59
    // Hour%4==3 (3,7,11,15,19,23): x8 at :29, x9 at :59
    schedule: {
        enabled: false,
        minutes: [29, 59],

        // Account mapping: 4-hour rotation (handled in code)
        accountMapping: {
            enabled: true,
            mapping: [29, 59, 29, 59, 29, 59, 29, 59],  // All 8 accounts
        },
    },

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

    // Validate account mapping if enabled
    if (loopConfig.schedule?.accountMapping?.enabled) {
        const mapping = loopConfig.schedule.accountMapping.mapping;
        if (!mapping || mapping.length === 0) {
            console.error('❌ Account mapping enabled but no mapping configured');
            return false;
        }

        if (mapping.length !== loopConfig.accounts.length) {
            console.error(`❌ Account mapping length (${mapping.length}) must match accounts length (${loopConfig.accounts.length})`);
            return false;
        }

        // Check for valid minute values (0-59)
        for (let i = 0; i < mapping.length; i++) {
            if (mapping[i] < 0 || mapping[i] > 59) {
                console.error(`❌ Invalid minute value in mapping[${i}]: ${mapping[i]} (must be 0-59)`);
                return false;
            }
        }

        console.log('✅ Account mapping validated:');
        for (let i = 0; i < loopConfig.accounts.length; i++) {
            console.log(`   Account ${i + 1} (${loopConfig.accounts[i].email}) → :${mapping[i].toString().padStart(2, '0')}`);
        }
    }

    return true;
}
