package com.tullip.journal;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.Test;

public class PinCryptoTest {
    @Test public void sha256Pbkdf2MatchesPublishedKnownVectors() throws Exception {
        byte[] salt = "salt".getBytes(StandardCharsets.US_ASCII);
        assertEquals("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
            PinCrypto.hex(PinCrypto.derive("password".toCharArray(), salt, 1)));
        assertEquals("ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43",
            PinCrypto.hex(PinCrypto.deriveWithMac("password".toCharArray(), salt, 2)));
        assertArrayEquals(PinCrypto.derive("123456".toCharArray(), salt, 100),
            PinCrypto.deriveWithMac("123456".toCharArray(), salt, 100));
    }
    @Test public void verifiersAreSaltedAndRejectWrongPin() throws Exception {
        byte[] firstSalt = PinCrypto.randomSalt();
        byte[] secondSalt = PinCrypto.randomSalt();
        assertEquals(32, firstSalt.length);
        assertFalse(Arrays.equals(firstSalt, secondSalt));
        byte[] first = PinCrypto.derive("123456".toCharArray(), firstSalt, 100);
        assertFalse(PinCrypto.matches(first, PinCrypto.derive("123456".toCharArray(), secondSalt, 100)));
        assertFalse(PinCrypto.matches(first, PinCrypto.derive("654321".toCharArray(), firstSalt, 100)));
        assertTrue(PinCrypto.matches(first, first.clone()));
    }
    @Test public void acceptsExactlySixAsciiDigitsAndRejectsMalformedVerifier() {
        assertTrue(PinCrypto.validPin("012345".toCharArray()));
        assertFalse(PinCrypto.validPin("12345".toCharArray()));
        assertFalse(PinCrypto.validPin("1234567".toCharArray()));
        assertFalse(PinCrypto.validPin("１２３４５６".toCharArray()));
        assertFalse(PinCrypto.validPin("12 456".toCharArray()));
        assertThrows(IllegalArgumentException.class, () -> PinCrypto.unhex("garbage", 32));
        assertArrayEquals(new byte[] {0, 15, -1}, PinCrypto.unhex("000fff", 3));
    }
}
