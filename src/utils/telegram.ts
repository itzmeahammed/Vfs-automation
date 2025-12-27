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
 * Send slot found alert
 */
export async function sendSlotAlert(slotDate: string, accountEmail: string): Promise<void> {
    const message = `
🎯 <b>VFS SLOT FOUND!</b>

📅 <b>Date:</b> ${slotDate}
📧 <b>Account:</b> ${accountEmail}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

🔥 Quick! Login and book now!
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
