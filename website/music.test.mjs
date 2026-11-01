import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_TRACKS, normaliseMusicPreference } from './dist/music.js';

test('music tracks are bundled local files', () => {
  assert.equal(MUSIC_TRACKS.length, 1);
  for (const track of MUSIC_TRACKS) {
    assert.match(track, /^assets\/music\/[a-z-]+\.mp3$/);
  }
});

test('music preference never requires autoplay and keeps a safe track index', () => {
  assert.deepEqual(normaliseMusicPreference(), { trackIndex: 0, enabled: false });
  assert.deepEqual(normaliseMusicPreference({ trackIndex: -1, enabled: 1 }), { trackIndex: 0, enabled: true });
  assert.deepEqual(normaliseMusicPreference({ trackIndex: 7, enabled: 0 }), { trackIndex: 0, enabled: false });
});
