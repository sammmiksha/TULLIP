/** Set only from the verified, published GitHub Release response. */
export const release = {
  available: false,
  version: '0.3.0',
  channel: 'Android testing build',
  downloadUrl: null,
  releasePage: 'https://github.com/sammmiksha/TULLIP/releases',
  sha256: null,
  sizeBytes: null,
};

export function releaseReady(value) {
  if (!value || value.available !== true || !/^\d+\.\d+\.\d+$/.test(value.version)
      || !/^[a-f0-9]{64}$/.test(value.sha256 ?? '')
      || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0) return false;
  try {
    const url = new URL(value.downloadUrl);
    const page = new URL(value.releasePage);
    const prefix = `/sammmiksha/TULLIP/releases/download/v${value.version}/`;
    return url.origin === 'https://github.com' && url.pathname.startsWith(prefix)
      && /^[A-Za-z0-9._-]+\.apk$/.test(url.pathname.slice(prefix.length))
      && !url.search && !url.hash && !url.username && !url.password
      && page.href === `https://github.com/sammmiksha/TULLIP/releases/tag/v${value.version}`;
  } catch { return false; }
}

export function renderRelease(root = document) {
  if (!releaseReady(release)) return;
  const button = root.querySelector('[data-apk-download]');
  button.href = release.downloadUrl;
  button.textContent = `Download TULLIP v${release.version} APK ↓`;
  root.querySelector('.release-status').textContent = `${release.channel} · v${release.version} · ${(release.sizeBytes / 1048576).toFixed(1)} MB`;
  const details = root.querySelector('[data-release-details]');
  details.hidden = false;
  details.querySelector('code').textContent = release.sha256;
  details.querySelector('a').href = release.releasePage;
  root.querySelector('[data-download-answer]').textContent = 'Use the Download APK button below. It downloads the published Android testing build from the TULLIP GitHub Release. No GitHub account is required for this public download. Review the release notes and back up your journal before updating.';
  root.querySelector('[data-install-heading]').textContent = 'INSTALL THE ANDROID TESTING BUILD';
}
