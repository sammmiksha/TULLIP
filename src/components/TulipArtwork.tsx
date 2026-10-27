const flowerUrl = new URL('../assets/tullip-flower.png', import.meta.url).href;

/** Original owner-supplied transparent artwork; only empty margins are outside the display frame. */
export function TulipArtwork() {
  return <span className="supplied-tulip" aria-hidden="true"><img src={flowerUrl} alt="" width="500" height="500" draggable={false} /></span>;
}
