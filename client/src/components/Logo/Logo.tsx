import { useTheme } from '../../contexts/ThemeContext.js';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
  const { resolvedTheme } = useTheme();
  const src = resolvedTheme === 'dark' ? '/logo-dark.svg' : '/logo.svg';
  return <img src={src} alt="Cornerstone" width={size} height={size} className={className} />;
}
