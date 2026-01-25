/**
 * Telegram Notification Utility
 * 
 * Sends notifications via Telegram bot when slots are found.
 */

import { loopConfig } from '../config/loop-config.js';

/**
 * Send a message via Telegram bot
 */
export async function sendTelegramMessage(message: string): Promise<boolean> {
    const { telegram } = loopConfig;

    if (!telegram.enabled) {
        console.log('📱 Telegram disabled - skipping notification');
        return false;
    }

    if (!telegram.botToken || !telegram.chatId) {
        console.log('⚠️ Telegram bot token or chat ID not configured');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegram.chatId,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        if (response.ok) {
            console.log('✅ Telegram notification sent');
            return true;
        } else {
            const error = await response.text();
            console.log('❌ Telegram error:', error);
            return false;
        }
    } catch (error) {
        console.log('❌ Failed to send Telegram message:', error);
        return false;
    }
}

/**
 * Send slot found alert with enhanced visual formatting
 */
export async function sendSlotAlert(slotDate: string, accountEmail: string, visaType?: string): Promise<void> {
    // Parse the slot dates from the formatted string
    const slots = slotDate.split('\n').filter(line => line.trim());

    let slotsFormatted = '';
    slots.forEach(slot => {
        // Extract applicant count and date
        const match = slot.match(/(\d+)[.,]\s*(\d+)[,\s]+Applicants is:\s*(\d{2}-\d{2}-\d{4})/i);
        if (match) {
            const applicants = match[2];
            const date = match[3];
            slotsFormatted += `\n   🗓️  <b>${applicants} Applicant${applicants !== '1' ? 's' : ''}</b> → ${date}`;
        } else {
            slotsFormatted += `\n   📅  ${slot}`;
        }
    });

    const visaTypeInfo = visaType ? `📍 <b>Visa Type:</b> ${visaType}\n` : '';

    const message = `
🚨 <b>━━━━━━━━━━━━━━━━━━━━━━</b> 🚨
⚡ <b>VFS SLOTS AVAILABLE!</b> ⚡
🇮🇹 <b>ITALY - DUBAI</b> 🇦🇪
🚨 <b>━━━━━━━━━━━━━━━━━━━━━━</b> 🚨

✨ <b>AVAILABLE DATES:</b>${slotsFormatted}

━━━━━━━━━━━━━━━━━━━━━━━━━━

${visaTypeInfo}👤 <b>Account:</b> <code>${accountEmail}</code>
⏰ <b>Detected:</b> ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 <b>ACTION REQUIRED!</b>
👉 Login NOW and complete booking
⚡ Slots fill up FAST!

🔗 <a href="https://visa.vfsglobal.com/are/en/ita/login">Click to Login</a>
    `.trim();

    await sendTelegramMessage(message);
}

/**
 * Send status update
 */
export async function sendStatusUpdate(status: string): Promise<void> {
    const message = `
📊 <b>VFS Bot Status</b>

${status}

⏰ ${new Date().toLocaleString()}
    `.trim();

    await sendTelegramMessage(message);
}

/**
 * Send error alert
 */
export async function sendErrorAlert(error: string, accountEmail?: string): Promise<void> {
    const message = `
❌ <b>VFS Bot Error</b>

${accountEmail ? `📧 <b>Account:</b> ${accountEmail}\n` : ''}
🔴 <b>Error:</b> ${error}

⏰ ${new Date().toLocaleString()}
    `.trim();

    await sendTelegramMessage(message);
}
