import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext.js';

type LogoVariant = 'icon' | 'full';

interface LogoProps {
  size?: number;
  className?: string;
  /** 'icon' = square icon (sidebar usage), 'full' = full logo with text (auth pages). Default: 'icon' */
  variant?: LogoVariant;
}

export function Logo({ size = 32, className, variant = 'icon' }: LogoProps) {
  const { t } = useTranslation('common');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (variant === 'full') {
    const src = isDark ? '/logo-dark.svg' : '/logo.svg';
    // Full logo: height-based sizing, width auto to preserve natural aspect ratio
    return <img src={src} alt={t('appName')} height={size} className={className} />;
  }

  // Icon variant: square dimensions (existing sidebar behavior)
  const src = isDark ? '/icon-dark.svg' : '/icon.svg';
  return <img src={src} alt={t('appName')} width={size} height={size} className={className} />;
}
