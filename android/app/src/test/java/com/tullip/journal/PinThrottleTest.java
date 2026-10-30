package com.tullip.journal;

import static org.junit.Assert.*;
import org.junit.Test;

public class PinThrottleTest {
    @Test public void cooldownStartsAtFifthFailureAndIsCapped() {
        assertEquals(0, PinThrottle.delayMillis(4));
        assertEquals(30_000, PinThrottle.delayMillis(5));
        assertEquals(60_000, PinThrottle.delayMillis(6));
        assertEquals(1_800_000, PinThrottle.delayMillis(99));
    }
    @Test public void sameBootUsesMonotonicClockDespiteWallClockChanges() {
        assertEquals(20_000, PinThrottle.remaining(999_999, 10_000, 4, 30_000, 30_000, 4));
        assertEquals(20_000, PinThrottle.remaining(0, 10_000, 4, 30_000, 30_000, 4));
        assertEquals(0, PinThrottle.remaining(0, 40_000, 4, 30_000, 30_000, 4));
    }
    @Test public void afterRebootUsesPersistedWallDeadlineAndNeverOverflowWaits() {
        assertEquals(20_000, PinThrottle.remaining(10_000, 0, 5, 30_000, 999_999, 4));
        assertEquals(PinThrottle.MAX_DELAY_MS, PinThrottle.remaining(0, 0, 5, Long.MAX_VALUE, 0, 4));
    }
}
