/**
 * Loop Configuration
 * 
 * Central config for multi-account slot checking loop.
 * Edit this file to configure accounts, intervals, and Telegram.
 */

export interface AccountCredentials {
    email: string;
    password: string;
    gmailAppPassword?: string;  // Gmail App Password for OTP (optional, uses gmail.appPassword if not set)
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
     * Interval between login cycles in minutes (default: 10-15)
     * Note: Ignored if schedule.enabled is true
     */
    intervalMinutes: number;

    /**
     * Strict Schedule: Run only at specific minutes of the hour (e.g. 29, 59)
     * If enabled, 'intervalMinutes' is ignored.
     */
    schedule?: {
        enabled: boolean;
        minutes: number[]; // e.g. [29, 59]

        /**
         * OPTIONAL: Map specific accounts to specific minutes
         * If enabled, each account runs ONLY at its assigned minute
         * Example: { enabled: true, mapping: [29, 59] }
         *   - Account 1 runs at XX:29
         *   - Account 2 runs at XX:59
         */
        accountMapping?: {
            enabled: boolean;
            mapping: number[];  // e.g. [29, 59] - index matches account index
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
     * VFS booking sub-category (DEPRECATED - use visaTypes instead)
     */
    subCategory: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family';

    /**
     * Visa types to check in each cycle
     * Each type will be checked sequentially per login
     * Example: [{ name: 'Tourist', category: 'Short Stay', subCategory: 'tourism' }]
     */
    visaTypes?: Array<{
        name: string;  // Display name (e.g., 'Tourist', 'Schengen')
        centre: 'dubai' | 'abudhabi';  // Application centre
        category: string;  // e.g., 'Short Stay', 'Schengen'
        subCategory: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family';
    }>;

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
    // Each account can have its own Gmail App Password for OTP
    accounts: [
        {
            email: 'abeerporto7@gmail.com',
            password: 'Trav@123',
            gmailAppPassword: 'hrkg mylh pqbm xrbm',  // Abeer's Gmail App Password
        },
        {
            email: 'carlomaria198711@gmail.com',
            password: 'Anypassw0rd@',
            gmailAppPassword: 'mctm somb ortc pulv',  // Carlo's Gmail App Password
        },
    ],

    // Wait this many minutes between account cycles (default: 12)
    intervalMinutes: 12,

    // Strict Schedule: Run only at these minutes (e.g. XX:29, XX:59)
    // If enabled, intervalMinutes is ignored.
    schedule: {
        enabled: true,
        minutes: [29, 59],

        // OPTIONAL: Map accounts to specific minutes
        // If enabled with 2 accounts:
        //   - Account 1 runs ONLY at XX:29
        //   - Account 2 runs ONLY at XX:59
        accountMapping: {
            enabled: false,  // Set to true to enable account-to-minute mapping
            mapping: [29, 59],  // mapping[0]=29 for account[0], mapping[1]=59 for account[1]
        },
    },

    // Telegram settings
    telegram: {
        enabled: true,  // Set to true to enable
        botToken: '8380612073:AAEEaPY_XMcJlsck_yzB2a8SN7cheXd10oE',  // Get from @BotFather
        chatId: '-1003422302979',       // Your Telegram chat ID
    },

    // Gmail settings for OTP (VFS Italy)
    // NOTE: Each account uses its own Gmail for OTP (account.email)
    // The appPassword below is used as FALLBACK if account.gmailAppPassword is not set
    gmail: {
        enabled: true,  // Set to true to enable OTP fetching
        user: 'abeerporto7@gmail.com',  // Fallback Gmail (not used if account has gmailAppPassword)
        appPassword: 'hrkg mylh pqbm xrbm',  // Fallback App Password
    },

    // VFS sub-category (kept for backward compatibility)
    subCategory: 'tourism',

    // ═══════════════════════════════════════════════════════════════
    // 🎯 VISA TYPES TO CHECK (Check multiple types per cycle)
    // ═══════════════════════════════════════════════════════════════
    // Define multiple visa types to check in each login session
    // The bot will check each type sequentially and report separately
    visaTypes: [
        {
            name: 'Tourist',           // Display name for notifications
            centre: 'dubai',           // Application centre
            category: 'Short Stay',    // Visa category
            subCategory: 'tourism',    // Sub-category
        },
        {
            name: 'Schengen',          // Display name for notifications
            centre: 'dubai',           // Application centre
            category: 'Schengen',      // Visa category
            subCategory: 'tourism',    // Not used (auto-fills to "Schengen - Visa")
        },
    ],

    // Browser settings
    headless: true,  // false = show browser window
    screenshots: true,

    // AWS IP Rotation (Enable ONLY on AWS EC2 with IAM Role)
    rotateIP: false,
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

    // Removed slotsPerLogin validation - now using visaTypes array

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
            console.error(`   Expected mapping for ${loopConfig.accounts.length} accounts, got ${mapping.length} entries`);
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
