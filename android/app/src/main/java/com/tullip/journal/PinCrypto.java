package com.tullip.journal;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/** PIN verifiers only; no PIN is persisted or sent through the JavaScript bridge. */
final class PinCrypto {
    static final int ITERATIONS = 600_000;
    static final int SALT_BYTES = 32;
    private PinCrypto() {}

    static boolean validPin(char[] pin) {
        if (pin == null || pin.length != 6) return false;
        for (char digit : pin) if (digit < '0' || digit > '9') return false;
        return true;
    }

    static byte[] randomSalt() {
        byte[] salt = new byte[SALT_BYTES];
        new SecureRandom().nextBytes(salt);
        return salt;
    }

    static byte[] derive(char[] pin, byte[] salt, int iterations) throws GeneralSecurityException {
        if (iterations < 1 || salt.length < 1) throw new IllegalArgumentException("Invalid KDF parameters");
        PBEKeySpec specification = new PBEKeySpec(pin, salt, iterations, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(specification).getEncoded();
        } catch (java.security.NoSuchAlgorithmException unavailableOnOlderAndroid) {
            // PBKDF2WithHmacSHA256 is built in from API 26. HmacSHA256 is available
            // on API 24-25: the standard one-block PBKDF2 construction preserves the format.
            return deriveWithMac(pin, salt, iterations);
        } finally { specification.clearPassword(); }
    }

    static byte[] deriveWithMac(char[] pin, byte[] salt, int iterations) throws GeneralSecurityException {
        if (iterations < 1 || salt.length < 1) throw new IllegalArgumentException("Invalid KDF parameters");
        ByteBuffer encoded = StandardCharsets.UTF_8.encode(CharBuffer.wrap(pin));
        byte[] secret = new byte[encoded.remaining()];
        encoded.get(secret);
        if (encoded.hasArray()) Arrays.fill(encoded.array(), (byte) 0);
        byte[] block = Arrays.copyOf(salt, salt.length + 4);
        block[block.length - 1] = 1;
        byte[] current = null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            current = mac.doFinal(block);
            byte[] output = current.clone();
            for (int round = 1; round < iterations; round++) {
                byte[] next = mac.doFinal(current);
                Arrays.fill(current, (byte) 0);
                current = next;
                for (int index = 0; index < output.length; index++) output[index] ^= current[index];
            }
            return output;
        } finally {
            Arrays.fill(secret, (byte) 0);
            Arrays.fill(block, (byte) 0);
            if (current != null) Arrays.fill(current, (byte) 0);
        }
    }

    static boolean matches(byte[] expected, byte[] actual) { return MessageDigest.isEqual(expected, actual); }

    static String hex(byte[] bytes) {
        char[] output = new char[bytes.length * 2];
        char[] digits = "0123456789abcdef".toCharArray();
        for (int index = 0; index < bytes.length; index++) {
            output[index * 2] = digits[(bytes[index] & 255) >>> 4];
            output[index * 2 + 1] = digits[bytes[index] & 15];
        }
        return new String(output);
    }

    static byte[] unhex(String value, int bytes) {
        if (value == null || value.length() != bytes * 2) throw new IllegalArgumentException("Invalid verifier");
        byte[] result = new byte[bytes];
        for (int index = 0; index < bytes; index++) {
            int first = Character.digit(value.charAt(index * 2), 16);
            int second = Character.digit(value.charAt(index * 2 + 1), 16);
            if (first < 0 || second < 0) throw new IllegalArgumentException("Invalid verifier");
            result[index] = (byte) ((first << 4) | second);
        }
        return result;
    }
}
