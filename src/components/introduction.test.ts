import { describe, expect, it } from 'vitest';
import { adjacentTourStep, parseOpeningBalance, TOUR_STEPS, validateDisplayName } from './introduction';

describe('personalized introduction', () => {
  it('trims names without restricting Unicode or ordinary punctuation', () => {
    expect(validateDisplayName('  समिक्षा 🌷  ')).toEqual({ value: 'समिक्षा 🌷' });
    expect(validateDisplayName("Anne-Marie O’Neil")).toEqual({ value: 'Anne-Marie O’Neil' });
    expect(validateDisplayName('🌷'.repeat(40)).error).toBeUndefined();
    expect(validateDisplayName('🌷'.repeat(41)).error).toContain('40');
  });
  it('distinguishes intentionally skipped names from invalid input', () => {
    expect(validateDisplayName('  ').error).toContain('Skip');
    expect(validateDisplayName('  ', true)).toEqual({ value: '' });
    expect(validateDisplayName('Name\nSecret').error).toContain('one line');
  });
  it('parses optional and negative opening balances to integer paise', () => {
    expect(parseOpeningBalance('')).toBe(0);
    expect(parseOpeningBalance('0')).toBe(0);
    expect(parseOpeningBalance('20000')).toBe(2000000);
    expect(parseOpeningBalance('123.45')).toBe(12345);
    expect(parseOpeningBalance('-12.05')).toBe(-1205);
    for (const value of ['1.234', 'NaN', 'Infinity', '1e3', '9999999999999999999']) expect(parseOpeningBalance(value)).toBeNull();
  });
});

describe('guided walkthrough', () => {
  it('bounds navigation at the first and last step, allowing safe replay from zero', () => {
    expect(adjacentTourStep(0, -1)).toBe(0);
    expect(adjacentTourStep(0, 1)).toBe(1);
    expect(adjacentTourStep(TOUR_STEPS.length - 1, 1)).toBe(TOUR_STEPS.length - 1);
    expect(adjacentTourStep(TOUR_STEPS.length - 1, -1)).toBe(TOUR_STEPS.length - 2);
  });
  it('covers all six screens, and never needs a fabricated jar for contribution guidance', () => {
    expect(new Set(TOUR_STEPS.map((step) => step.screen)).size).toBe(6);
    for (const target of ['jar-add', 'jar-withdraw']) {
      const step = TOUR_STEPS.find((entry) => entry.target === target);
      expect(step?.fallback).toBe('jar-create');
      expect(step?.unavailable).toBeTruthy();
    }
  });
});
