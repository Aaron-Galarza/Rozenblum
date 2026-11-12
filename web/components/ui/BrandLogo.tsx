import { BRAND_LOGO_URL, BRAND_NAME } from "@rozenblum/shared";

export default function BrandLogo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className={className} style={inverted ? { filter: "brightness(0) invert(1)", opacity: 0.75 } : undefined} />;
}
