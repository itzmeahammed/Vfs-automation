/**
 * Logger Utility
 * 
 * Provides consistent, colorful logging with timestamp and level support.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
    level: LogLevel;
    showTimestamp: boolean;
    prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LOG_ICONS: Record<LogLevel, string> = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
};

class Logger {
    private config: LoggerConfig;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            level: 'info',
            showTimestamp: true,
            ...config,
        };
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
    }

    private formatMessage(level: LogLevel, message: string): string {
        const parts: string[] = [];

        if (this.config.showTimestamp) {
            parts.push(`[${new Date().toISOString().slice(11, 19)}]`);
        }

        parts.push(LOG_ICONS[level]);

        if (this.config.prefix) {
            parts.push(`[${this.config.prefix}]`);
        }

        parts.push(message);

        return parts.join(' ');
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message), ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message), ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message), ...args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message), ...args);
        }
    }

    success(message: string, ...args: unknown[]): void {
        console.log(`✅ ${message}`, ...args);
    }

    step(stepName: string, message: string): void {
        console.log(`\n📌 [${stepName}] ${message}`);
    }

    divider(char: string = '─', length: number = 50): void {
        console.log(char.repeat(length));
    }

    box(title: string, content: string[]): void {
        const maxLength = Math.max(title.length, ...content.map(c => c.length)) + 4;
        const horizontal = '═'.repeat(maxLength);

        console.log(`╔${horizontal}╗`);
        console.log(`║  ${title.padEnd(maxLength - 2)}║`);
        console.log(`╠${horizontal}╣`);
        content.forEach(line => {
            console.log(`║  ${line.padEnd(maxLength - 2)}║`);
        });
        console.log(`╚${horizontal}╝`);
    }

    child(prefix: string): Logger {
        return new Logger({
            ...this.config,
            prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
        });
    }
}

// Default logger instance
export const logger = new Logger();

// Create logger with custom prefix
export function createLogger(prefix: string): Logger {
    return logger.child(prefix);
}

export { Logger };
