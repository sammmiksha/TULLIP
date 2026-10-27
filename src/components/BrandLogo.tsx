const logoUrl = new URL('../assets/tullip-logo.png', import.meta.url).href;

/** The owner's original supplied PNG, rendered without repainting or cropping. */
export function BrandLogo({ decorative = true }: { decorative?: boolean }) {
  return <img className="tullip-logo" src={logoUrl} width="736" height="736"
    alt={decorative ? '' : 'TULLIP logo: a lavender arcade cabinet'}
    aria-hidden={decorative ? true : undefined} draggable={false} />;
}
