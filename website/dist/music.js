const STORAGE_KEY = 'tullip.background-music.v1';

export const MUSIC_TRACKS = [
  'assets/music/carefree.mp3',
];

export function normaliseMusicPreference(value) {
  const fallback = { trackIndex: 0, enabled: false };
  if (!value || typeof value !== 'object') return fallback;
  const trackIndex = Number.isInteger(value.trackIndex)
    ? ((value.trackIndex % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length
    : fallback.trackIndex;
  return { trackIndex, enabled: Boolean(value.enabled) };
}

function readPreference() {
  try { return normaliseMusicPreference(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return normaliseMusicPreference(); }
}

export function initMusicToggle(root = document) {
  const toggle = root.querySelector('#sound-toggle');
  const audio = root.querySelector('#tullip-music');
  if (!toggle || !audio) return;

  let preference = readPreference();
  let failed = false;
  audio.volume = .34;

  const savePreference = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preference)); }
    catch { /* Storage can be unavailable in private contexts. */ }
  };

  function render(playing) {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.classList.toggle('is-playing', playing);
    if (failed) {
      toggle.setAttribute('aria-label', 'Background music could not load. Try again.');
      toggle.title = 'Music unavailable — try again';
      return;
    }
    toggle.setAttribute('aria-label', playing ? 'Turn background music off' : 'Turn background music on');
    toggle.title = playing ? 'Music on' : 'Music off';
  }

  function loadCurrentTrack() {
    audio.src = MUSIC_TRACKS[preference.trackIndex];
    audio.load();
  }

  async function start() {
    const needsLoad = failed || !audio.getAttribute('src');
    failed = false;
    if (needsLoad) loadCurrentTrack();
    try {
      await audio.play();
    } catch {
      failed = true;
      preference.enabled = false;
      savePreference();
      render(false);
    }
  }

  function stop() {
    audio.pause();
    preference.enabled = false;
    savePreference();
    render(false);
  }

  toggle.addEventListener('click', () => {
    if (audio.paused) void start();
    else stop();
  });
  audio.addEventListener('play', () => {
    preference.enabled = true;
    savePreference();
    render(true);
  });
  audio.addEventListener('pause', () => { if (!audio.ended) render(false); });
  audio.addEventListener('ended', () => {
    preference.trackIndex = (preference.trackIndex + 1) % MUSIC_TRACKS.length;
    savePreference();
    loadCurrentTrack();
    void start();
  });
  audio.addEventListener('error', () => {
    failed = true;
    preference.enabled = false;
    savePreference();
    render(false);
  });
  render(false);
}
