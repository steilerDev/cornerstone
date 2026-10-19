import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { Spinner } from '../Spinner/Spinner.js';
import { useWideDialog } from '../../hooks/useWideDialog.js';
import { captureFrame } from './captureFrame.js';
import { prefersReducedMotion } from './cameraSupport.js';
import { useCameraStream } from './useCameraStream.js';
import styles from './RapidCamera.module.css';

export {
  CAMERA_DENIED_SESSION_KEY,
  isCameraDeniedThisSession,
  isLiveCameraSupported,
} from './cameraSupport.js';

export interface RapidCameraProps {
  open: boolean;
  /** Called once per shutter press with the captured JPEG. */
  onShot: (file: File) => void;
  /** Done / Escape. */
  onClose: () => void;
  /** The host clicks its hidden native camera input here (same user gesture). */
  onUseCameraApp: () => void;
  /** Photos taken in this camera session (the host counts them). */
  shotCount: number;
  lastShotUrl?: string;
  onRemoveLast?: () => void;
  /** Chip slot (`TagChips tone="onPhoto"`). */
  children?: ReactNode;
  returnFocusRef: RefObject<HTMLElement | null>;
}

const SHUTTER_COOLDOWN_MS = 150;
const FLASH_MS = 100;
const TRAY_SIZE = 6;

interface CameraStageProps extends Omit<RapidCameraProps, 'open' | 'returnFocusRef'> {
  shutterRef: RefObject<HTMLButtonElement | null>;
}

function CameraStage({
  onShot,
  onClose,
  onUseCameraApp,
  shotCount,
  lastShotUrl,
  onRemoveLast,
  children,
  shutterRef,
}: CameraStageProps) {
  const { t } = useTranslation('photos');
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCameraStream(videoRef);
  const lastShotAtRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [tray, setTray] = useState<readonly string[]>([]);
  const trayRef = useRef<readonly string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  const updateTray = (next: readonly string[]) => {
    trayRef.current = next;
    setTray(next);
  };

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
      trayRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const live = camera.status.kind === 'live';

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!live || !video) return;
    const now = Date.now();
    if (now - lastShotAtRef.current < SHUTTER_COOLDOWN_MS) return;
    lastShotAtRef.current = now;
    const reduced = prefersReducedMotion();
    if (!reduced) {
      setFlashing(true);
      flashTimerRef.current = setTimeout(() => setFlashing(false), FLASH_MS);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
    }
    try {
      const file = await captureFrame(video, camera.getTrack());
      const url = URL.createObjectURL(file);
      const next = [url, ...trayRef.current];
      next.slice(TRAY_SIZE).forEach((old) => URL.revokeObjectURL(old));
      updateTray(next.slice(0, TRAY_SIZE));
      setAnnouncement(t('camera.shotTaken', { n: shotCount + 1 }));
      onShot(file);
    } catch {
      // A failed frame is not announced as a photo; the user simply presses again.
    }
  };

  const handleRemoveLast = () => {
    const [newest, ...rest] = trayRef.current;
    if (newest) {
      URL.revokeObjectURL(newest);
      updateTray(rest);
    }
    setAnnouncement(t('camera.lastRemoved', { count: Math.max(0, shotCount - 1) }));
    onRemoveLast?.();
  };

  const handleSwitch = () => {
    camera.toggleFacing();
    setAnnouncement(
      camera.facing === 'environment' ? t('camera.usingFront') : t('camera.usingBack'),
    );
  };

  const handleTorch = async () => {
    const next = await camera.toggleTorch();
    setAnnouncement(next ? t('camera.flashOn') : t('camera.flashOff'));
  };

  const trayUrls = tray.length > 0 ? tray : lastShotUrl ? [lastShotUrl] : [];
  const status = camera.status;

  return (
    <div className={styles.stage} data-testid="rapid-camera">
      <div className={styles.viewfinder}>
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          muted
          autoPlay
          aria-hidden="true"
          data-testid="rapid-camera-video"
        />
        {flashing ? <div className={styles.flash} aria-hidden="true" /> : null}

        {children ? <div className={styles.chips}>{children}</div> : null}

        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.textButton}
            onClick={onUseCameraApp}
            data-testid="rapid-camera-use-app"
          >
            {t('camera.useCameraApp')}
          </button>
          <span className={styles.counter} aria-hidden="true" data-testid="rapid-camera-count">
            {t('camera.count', { count: shotCount })}
          </span>
          {shotCount > 0 && onRemoveLast ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={handleRemoveLast}
              data-testid="rapid-camera-remove-last"
            >
              {t('camera.removeLast')}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.doneButton}
            onClick={onClose}
            data-testid="rapid-camera-done"
          >
            {t('camera.done')}
          </button>
        </div>

        {status.kind === 'starting' ? (
          <div className={styles.panel} data-testid="rapid-camera-starting">
            <Spinner size="md" color="muted" label={t('camera.starting')} />
            <p className={styles.panelText}>{t('camera.starting')}</p>
          </div>
        ) : null}
        {status.kind === 'error' ? (
          <div className={styles.panel} data-testid="rapid-camera-error">
            <h3 className={styles.panelTitle}>
              {status.reason === 'denied' ? t('camera.deniedTitle') : t('camera.unavailableTitle')}
            </h3>
            <p className={styles.panelText}>
              {status.reason === 'busy' ? t('camera.busy') : t('camera.fallbackLead')}
            </p>
            {status.reason === 'denied' ? (
              <p className={styles.panelText}>{t('camera.deniedHint')}</p>
            ) : null}
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.panelButton}
                onClick={onUseCameraApp}
                data-testid="rapid-camera-error-use-app"
              >
                {t('camera.useCameraApp')}
              </button>
              <button type="button" className={styles.panelButton} onClick={onClose}>
                {t('camera.done')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.controls}>
        <div className={styles.tray} aria-hidden="true" data-testid="rapid-camera-tray">
          {trayUrls.map((url) => (
            <img key={url} src={url} alt="" className={styles.trayImage} />
          ))}
        </div>
        <button
          ref={shutterRef}
          type="button"
          className={styles.shutter}
          aria-label={t('camera.shutter')}
          aria-disabled={live ? undefined : true}
          onClick={() => void handleShutter()}
          data-testid="rapid-camera-shutter"
        />
        <div className={styles.extras}>
          {camera.canSwitch ? (
            <button
              type="button"
              className={styles.roundButton}
              aria-label={t('camera.switchCamera')}
              onClick={handleSwitch}
              data-testid="rapid-camera-switch"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8a6 6 0 0 1 10.5-2.5M16 12a6 6 0 0 1-10.5 2.5" />
                <path d="M14.5 2.5v3h-3M5.5 17.5v-3h3" />
              </svg>
            </button>
          ) : null}
          {status.kind === 'live' && status.torch ? (
            <button
              type="button"
              className={styles.roundButton}
              aria-label={t('camera.flash')}
              aria-pressed={camera.torchOn}
              onClick={() => void handleTorch()}
              data-testid="rapid-camera-flash"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 2L4 11h5l-1 7 7-9h-5z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div role="status" className={styles.srOnly} data-testid="rapid-camera-status">
        {announcement}
      </div>
    </div>
  );
}

/**
 * Live `getUserMedia` viewfinder for rapid shooting: a full-screen Sheet below 768px, a Modal from
 * 768px. Never opens the native camera on its own: when the stream cannot start it shows why and
 * offers "Use camera app", whose click the host handles in the same user gesture.
 */
export function RapidCamera({ open, returnFocusRef, ...stageProps }: RapidCameraProps) {
  const { t } = useTranslation('photos');
  const wide = useWideDialog();
  const sheetId = useId();
  const shutterRef = useRef<HTMLButtonElement>(null);

  if (wide) {
    return open ? (
      <Modal
        title={t('camera.title')}
        hideTitle
        onClose={stageProps.onClose}
        className={styles.modal}
        initialFocusRef={shutterRef}
        returnFocusRef={returnFocusRef}
      >
        <CameraStage {...stageProps} shutterRef={shutterRef} />
      </Modal>
    ) : null;
  }
  return (
    <Sheet
      id={sheetId}
      open={open}
      variant="fullScreen"
      title={t('camera.title')}
      hideTitle
      onClose={stageProps.onClose}
      initialFocusRef={shutterRef}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="rapid-camera-sheet"
    >
      {open ? <CameraStage {...stageProps} shutterRef={shutterRef} /> : null}
    </Sheet>
  );
}
