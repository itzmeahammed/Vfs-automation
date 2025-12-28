/**
 * VFS Malta Visa Application Configuration
 * 
 * Fill in your details below. These will be used to:
 * 1. Select the application centre and category
 * 2. Auto-fill the "Your Details" form
 */

export interface ApplicantDetails {
    // Personal Information (as per passport)
    firstName: string;
    lastName: string;
    passportNumber: string;
    nationality: string;  // e.g., "INDIA", "PAKISTAN", "PHILIPPINES"

    // Contact Information
    email: string;
    phoneCode: string;     // e.g., "971" for UAE
    phoneNumber: string;   // e.g., "501234567"

    // Address Information
    addressLine1: string;
    addressLine2?: string;  // Optional
    state: string;
    city: string;
    postcode: string;
}

export interface BookingPreferences {
    // Application Centre: Choose your VFS location
    // Options: 'dubai' | 'abudhabi'
    applicationCentre: 'dubai' | 'abudhabi';

    // Visa Sub-Category
    // Options: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family'
    subCategory: 'tourism' | 'business' | 'sports_cultural' | 'visiting_family';
}

export interface VFSConfig {
    applicant: ApplicantDetails;
    booking: BookingPreferences;
}

// ═══════════════════════════════════════════════════════════════
// 📝 FILL IN YOUR DETAILS BELOW
// ═══════════════════════════════════════════════════════════════

export const vfsConfig: VFSConfig = {
    applicant: {
        // Personal Information (EXACTLY as shown on passport)
        firstName: 'AHAMMED',
        lastName: 'TEST', // Updates as needed
        passportNumber: 'N12345678',
        nationality: 'UNITED ARAB EMIRATES',  // Use UPPERCASE (e.g., INDIA, PAKISTAN, PHILIPPINES)

        // Contact Information
        email: 'ahammed@example.com',
        phoneCode: '971',      // UAE country code (without +)
        phoneNumber: '501234567',

        // Address Information
        addressLine1: 'Dubai',
        addressLine2: '',  // Optional - can be empty string
        state: 'Dubai',
        city: 'Dubai',
        postcode: '00000',
    },

    booking: {
        // Application Centre
        // 'dubai' = Malta Visa application center- Dubai
        // 'abudhabi' = Malta Visa application center- Abu Dhabi
        applicationCentre: 'dubai',

        // Visa Category (Short Stay is auto-selected)
        // 'tourism' = Tourism
        // 'business' = Business
        // 'sports_cultural' = Sports and Cultural
        // 'visiting_family' = Visiting Family and Friends
        subCategory: 'tourism',
    },
};

// ═══════════════════════════════════════════════════════════════
// 🔧 INTERNAL MAPPINGS (DO NOT MODIFY)
// ═══════════════════════════════════════════════════════════════

export const APPLICATION_CENTRES = {
    dubai: 'Malta Visa application center- Dubai',
    abudhabi: 'Malta Visa application center- Abu Dhabi',
} as const;

export const SUB_CATEGORIES = {
    tourism: 'Tourism',
    business: 'Business',
    sports_cultural: 'Sports and Cultural',
    visiting_family: 'Visiting Family and Friends',
} as const;

// Nationality options (common ones - VFS uses uppercase)
export const NATIONALITIES = [
    'INDIA',
    'PAKISTAN',
    'PHILIPPINES',
    'BANGLADESH',
    'NEPAL',
    'SRI LANKA',
    'EGYPT',
    'JORDAN',
    'LEBANON',
    'SYRIA',
    'IRAN',
    'IRAQ',
    'AFGHANISTAN',
    'CHINA',
    'RUSSIA',
    'UKRAINE',
    // Add more as needed
] as const;
