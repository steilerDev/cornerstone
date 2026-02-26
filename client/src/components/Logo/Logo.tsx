interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
  return <img src="/logo.svg" alt="Cornerstone" width={size} height={size} className={className} />;
}
