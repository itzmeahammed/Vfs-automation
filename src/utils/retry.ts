/**
 * Retry Utility with Exponential Backoff
 * 
 * Philosophy: "Implements human-like retry behavior with cooldowns.
 * Never loops aggressively or retries instantly."
 */

export interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterFactor: number;
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
};

/**
 * Execute function with retry logic and exponential backoff
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === cfg.maxAttempts) {
                break;
            }

            // Calculate delay with exponential backoff and jitter
            const exponentialDelay = cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1);
            const jitter = 1 - cfg.jitterFactor + Math.random() * (2 * cfg.jitterFactor);
            const delay = Math.min(exponentialDelay * jitter, cfg.maxDelayMs);

            if (cfg.onRetry) {
                cfg.onRetry(attempt, lastError, delay);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Sleep with optional jitter for human-like delays
 */
export async function humanSleep(baseMs: number, jitterPercent: number = 0.2): Promise<void> {
    const jitter = 1 - jitterPercent + Math.random() * (2 * jitterPercent);
    await new Promise(resolve => setTimeout(resolve, baseMs * jitter));
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeout(ms: number, message: string = 'Operation timed out'): Promise<never> {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message?: string
): Promise<T> {
    return Promise.race([
        promise,
        createTimeout(timeoutMs, message),
    ]);
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

/**
 * Safe file operation wrapper
 */
export async function safeFileOp<T>(
    operation: () => T | Promise<T>,
    fallback: T
): Promise<T> {
    try {
        return await operation();
    } catch {
        return fallback;
    }
}
