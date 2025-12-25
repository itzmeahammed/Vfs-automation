/**
 * System Comparison Tool
 * 
 * Run this on BOTH your laptop and office PC to find the difference
 */

import { chromium } from 'playwright';

async function collectFingerprint() {
    console.log('\n🔍 COLLECTING SYSTEM FINGERPRINT\n');
    console.log('This will save all browser details to a report file.\n');

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Override navigator.webdriver
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    console.log('📊 Collecting fingerprint data...\n');

    const fingerprint = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;

        return {
            // Browser Info
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            languages: navigator.languages,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: (navigator as any).deviceMemory,

            // Screen Info
            screenWidth: screen.width,
            screenHeight: screen.height,
            screenAvailWidth: screen.availWidth,
            screenAvailHeight: screen.availHeight,
            screenColorDepth: screen.colorDepth,
            screenPixelDepth: screen.pixelDepth,

            // WebGL (CRITICAL for Cloudflare)
            webglVendor: gl ? gl.getParameter(gl.VENDOR) : 'N/A',
            webglRenderer: gl ? gl.getParameter(gl.RENDERER) : 'N/A',

            // Chrome/Browser Detection
            isChrome: !!(window as any).chrome,
            chromeRuntime: typeof (window as any).chrome?.runtime !== 'undefined',

            // Automation Detection Points
            webdriver: navigator.webdriver,
            plugins: Array.from(navigator.plugins).map(p => p.name),
            mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type),

            // Permissions
            permissions: navigator.permissions ? 'Available' : 'Not Available',

            // Browser Features
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            maxTouchPoints: navigator.maxTouchPoints,

            // Timezone
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),

            // Window properties (bot detection)
            windowOuterWidth: window.outerWidth,
            windowOuterHeight: window.outerHeight,
            windowInnerWidth: window.innerWidth,
            windowInnerHeight: window.innerHeight,

            // Performance
            performanceNow: performance.now(),

            // Additional checks
            hasSelenium: !!(window as any).document?.documentElement?.getAttribute('selenium'),
            hasPhantom: !!(window as any)._phantom || !!(window as any).callPhantom,
            hasWebdriver: !!(window as any).webdriver || !!(document as any).webdriver,
        };
    });

    // Generate report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const report = `
╔════════════════════════════════════════════════════════════════╗
║           BROWSER FINGERPRINT REPORT                           ║
║           Generated: ${new Date().toLocaleString()}                    ║
╚════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 BROWSER INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User Agent:     ${fingerprint.userAgent}
Platform:       ${fingerprint.platform}
Language:       ${fingerprint.language}
Languages:      ${fingerprint.languages.join(', ')}
CPU Cores:      ${fingerprint.hardwareConcurrency}
Device Memory:  ${fingerprint.deviceMemory || 'N/A'} GB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️  SCREEN INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Screen Size:    ${fingerprint.screenWidth} x ${fingerprint.screenHeight}
Available Size: ${fingerprint.screenAvailWidth} x ${fingerprint.screenAvailHeight}
Color Depth:    ${fingerprint.screenColorDepth}
Pixel Depth:    ${fingerprint.screenPixelDepth}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎮 WEBGL (CRITICAL - Cloudflare checks this!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:         ${fingerprint.webglVendor}
Renderer:       ${fingerprint.webglRenderer}

⚠️  If these say "SwiftShader" or "ANGLE" = BOT DETECTED!
✅ Should say "Google Inc." or "Intel" or "NVIDIA"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 BOT DETECTION FLAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
navigator.webdriver:    ${fingerprint.webdriver} ${fingerprint.webdriver ? '❌ DETECTED!' : '✅ Hidden'}
Chrome Object:          ${fingerprint.isChrome ? '✅ Present' : '❌ Missing'}
Chrome Runtime:         ${fingerprint.chromeRuntime ? '✅ Present' : '❌ Missing'}
Selenium Attribute:     ${fingerprint.hasSelenium ? '❌ DETECTED!' : '✅ Clean'}
PhantomJS:              ${fingerprint.hasPhantom ? '❌ DETECTED!' : '✅ Clean'}
Window.webdriver:       ${fingerprint.hasWebdriver ? '❌ DETECTED!' : '✅ Clean'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 PLUGINS & MIME TYPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plugins Count:  ${fingerprint.plugins.length}
${fingerprint.plugins.length === 0 ? '⚠️  WARNING: No plugins (headless indicator!)' : '✅ Plugins detected'}

Mime Types:     ${fingerprint.mimeTypes.length}
${fingerprint.mimeTypes.length === 0 ? '⚠️  WARNING: No mime types (headless indicator!)' : '✅ Mime types detected'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 TIMEZONE & LOCALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Timezone:       ${fingerprint.timezone}
Offset:         ${fingerprint.timezoneOffset} minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 WINDOW DIMENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Outer:          ${fingerprint.windowOuterWidth} x ${fingerprint.windowOuterHeight}
Inner:          ${fingerprint.windowInnerWidth} x ${fingerprint.windowInnerHeight}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${getDetectionSummary(fingerprint)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 NEXT STEPS:
1. Run this on BOTH systems (laptop & office PC)
2. Save both reports
3. Compare line by line - differences = the problem!
4. Focus on WebGL and Bot Detection sections

`;

    console.log(report);

    const fs = await import('fs');
    const reportFile = `fingerprint-${timestamp}.txt`;
    fs.writeFileSync(reportFile, report);
    console.log(`✅ Report saved to: ${reportFile}\n`);

    console.log('🌐 Now opening VFS login page to test Turnstile...\n');

    try {
        await page.goto('https://visa.vfsglobal.com/are/en/mlt/login', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        console.log('✅ Page loaded. Check if Turnstile appears!\n');
        console.log('⏳ Keeping browser open for 60 seconds for inspection...\n');

        await page.waitForTimeout(60000);

    } catch (e) {
        console.log('⚠️  Could not load VFS page:', e);
    }

    await browser.close();
}

function getDetectionSummary(fp: any): string {
    const issues: string[] = [];

    if (fp.webdriver) issues.push('❌ navigator.webdriver is TRUE');
    if (!fp.isChrome) issues.push('❌ Chrome object missing');
    if (!fp.chromeRuntime) issues.push('❌ Chrome runtime missing');
    if (fp.plugins.length === 0) issues.push('⚠️  No browser plugins');
    if (fp.mimeTypes.length === 0) issues.push('⚠️  No MIME types');
    if (fp.webglRenderer?.includes('SwiftShader')) issues.push('❌ WebGL using SwiftShader (bot signal)');
    if (fp.webglRenderer?.includes('ANGLE')) issues.push('⚠️  WebGL using ANGLE');
    if (fp.hasSelenium) issues.push('❌ Selenium detected');
    if (fp.hasPhantom) issues.push('❌ PhantomJS detected');

    if (issues.length === 0) {
        return '✅ ALL CHECKS PASSED - Should bypass Turnstile!';
    }

    return `🚨 FOUND ${issues.length} ISSUE(S):\n${issues.map(i => `   ${i}`).join('\n')}`;
}

collectFingerprint().catch(console.error);
