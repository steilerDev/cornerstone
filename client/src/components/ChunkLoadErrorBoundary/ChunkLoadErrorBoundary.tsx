import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import i18n from '../../i18n/index.js';
import sharedStyles from '../../styles/shared.module.css';

const CHUNK_RELOAD_KEY = 'cornerstone:chunk-reload';

/** Returns true if the error looks like a Webpack/Vite ChunkLoadError or CSS chunk failure. */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /Loading (CSS )?chunk .* failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message)
  );
}

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ChunkLoadErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State | null {
    if (isChunkLoadError(error)) {
      return { hasError: true };
    }
    // Re-throw non-chunk errors so they propagate normally.
    throw error;
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (!isChunkLoadError(error)) return;
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === 'true';
    if (!alreadyReloaded) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');
      window.location.reload();
    }
    console.error('[ChunkLoadErrorBoundary] Chunk load failed', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={sharedStyles.loading}>
          <div className={sharedStyles.bannerError} role="alert">
            <p>{i18n.t('common:chunkError.message')}</p>
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={() => window.location.reload()}
            >
              {i18n.t('common:chunkError.refreshButton')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ChunkLoadErrorBoundary;
