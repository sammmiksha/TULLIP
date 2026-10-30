package com.tullip.journal;

/** Persisted failed attempts grow the cooldown; the current boot uses monotonic time. */
final class PinThrottle {
    static final long MAX_DELAY_MS = 30 * 60_000L;
    private PinThrottle() {}
    static long delayMillis(int failures) {
        if (failures < 5) return 0;
        int exponent = Math.min(6, Math.max(0, failures - 5));
        return Math.min(MAX_DELAY_MS, 30_000L << exponent);
    }
    static long remaining(long wallNow, long elapsedNow, int bootNow, long wallDeadline,
                          long elapsedDeadline, int recordedBoot) {
        long remaining = bootNow >= 0 && bootNow == recordedBoot
            ? elapsedDeadline - elapsedNow : wallDeadline - wallNow;
        return Math.max(0, Math.min(MAX_DELAY_MS, remaining));
    }
}
