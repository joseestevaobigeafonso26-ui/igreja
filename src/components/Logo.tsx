/** Logo da igreja num círculo branco (o logo tem letras escuras). Gira devagar; `spin={false}` deixa-o parado. */
export default function Logo({ size = 48, spin = true, className = "" }: { size?: number; spin?: boolean; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white shadow-md ${className}`}
      style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Logo da Igreja Comunitária Batista do Vale do Quixicongo"
        width={size} height={size} className={spin ? "logo-spin" : ""} style={{ width: "94%", height: "94%" }} />
    </span>
  );
}
