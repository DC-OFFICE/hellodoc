import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function allowsAdjacent(aEnd: string, bStart: string) {
  return aEnd === bStart;
}

function overlapsHalfOpen(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

describe('session interval rules', () => {
  it('allows adjacent half-open intervals', () => {
    assert.equal(allowsAdjacent('19:00', '19:00'), true);
    assert.equal(overlapsHalfOpen(17, 19, 19, 21), false);
  });

  it('detects overlapping intervals', () => {
    assert.equal(overlapsHalfOpen(17, 20, 19, 21), true);
  });
});
