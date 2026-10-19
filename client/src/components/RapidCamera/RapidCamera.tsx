import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { Spinner } from '../Spinner/Spinner.js';
import { useWideDialog } from '../../hooks/useWideDialog.js';
import { captureFrame } from './captureFrame.js';
import { prefersReducedMotion } from './cameraSupport.js';
import {
  hasImageCapture,
  imagePixels,
  isBelowFullResolution,
  isLowResDismissed,
  rememberLowResDismissed,
  trackPixels,
} from './resolution.js';
import { useCameraStream } from './useCameraStream.js';
import styles from './RapidCamera.module.css';

export {
  CAMERA_DENIED_SESSION_KEY,
  isCameraDeniedThisSession,
  isLiveCameraSupported,
} from './cameraSupport.js';

export interface RapidCameraProps {
  open: boolean;
  /**
   * Called synchronously at each shutter press with the frame being encoded (rejects when none could
   * be taken). The host counts the shot as saving until it is stored.
   */
  onShot: (frame: Promise<File>) => void;
  /** Called once nothing is saving any more (or after CLOSE_WAIT_MAX_MS). */
  onClose: () => void;
  /** The host clicks its hidden native camera input here (same user gesture). */
  onUseCameraApp: () => void;
  /** Shots of this camera session that are stored. */
  shotCount: number;
  /** Shots pressed but not yet stored (encoding or writing). */
  savingCount: number;
  /** Photos of this draft not yet uploaded ("n photos waiting to upload"); 0 hides the line. */
  waitingCount: number;
  lastShotUrl?: string;
  onRemoveLast?: () => void;
  /** Chip slot (`TagChips tone="onPhoto"`). */
  children?: ReactNode;
  returnFocusRef: RefObject<HTMLElement | null>;
}

const SHUTTER_COOLDOWN_MS = 150;
const FLASH_MS = 100;
const TRAY_SIZE = 6;
/** A hung IndexedDB must never trap the user in the camera. */
const CLOSE_WAIT_MAX_MS = 10_000;
/** If no frame event arrives (stubbed streams), the shutter is enabled anyway after this. */
const FRAME_READY_FALLBACK_MS = 1500;

interface CameraStageProps extends Omit<RapidCameraProps, 'open' | 'returnFocusRef' | 'onClose'> {
  shutterRef: RefObject<HTMLButtonElement | null>;
  closing: boolean;
  requestClose: () => void;
}

function CameraStage({
  onShot,
  onUseCameraApp,
  shotCount,
  savingCount,
  waitingCount,
  lastShotUrl,
  onRemoveLast,
  children,
  shutterRef,
  closing,
  requestClose,
}: CameraStageProps) {
  const { t } = useTranslation('photos');
  const descId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCameraStream(videoRef);
  const lastShotAtRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [tray, setTray] = useState<readonly string[]>([]);
  const trayRef = useRef<readonly string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const takenRef = useRef(0);
  const [shotLow, setShotLow] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(isLowResDismissed);
  const [hintAnnounced, setHintAnnounced] = useState(false);
  const [savingAnnounced, setSavingAnnounced] = useState(false);
  const checkedShotRef = useRef(false);

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

  // A press before the first decoded frame would add no shot, so the shutter stays aria-disabled
  // until the video has one (or the fallback timer fires).
  const [frameReady, setFrameReady] = useState(false);
  useEffect(() => {
    if (!live) return undefined;
    const video = videoRef.current;
    const markReady = () => setFrameReady(true);
    video?.addEventListener('loadeddata', markReady);
    video?.addEventListener('playing', markReady);
    const timer = setTimeout(
      markReady,
      video && video.readyState >= 2 ? 0 : FRAME_READY_FALLBACK_MS,
    );
    return () => {
      clearTimeout(timer);
      video?.removeEventListener('loadeddata', markReady);
      video?.removeEventListener('playing', markReady);
      setFrameReady(false);
    };
  }, [live]);

  // Without ImageCapture the still is the stream frame, so a small stream means small photos.
  // Recomputed only when the stream goes live (getTrack is stable).
  const getTrack = camera.getTrack;
  const trackLow = useMemo(() => {
    if (!live || hasImageCapture()) return false;
    const pixels = trackPixels(getTrack());
    return pixels !== null && isBelowFullResolution(pixels);
  }, [live, getTrack]);
  const hintVisible = (trackLow || shotLow) && !hintDismissed;

  // Announce the hint once (derived-state adjustment during render, not an effect).
  if (hintVisible && !hintAnnounced) {
    setHintAnnounced(true);
    setAnnouncement(t('camera.lowRes'));
  }

  // Announce "Saving photos…" once per close attempt, whichever path started it (button, Escape,
  // backdrop). Same render-time pattern as the hint.
  if (closing && !savingAnnounced) {
    setSavingAnnounced(true);
    setAnnouncement(t('camera.saving'));
  }

  const checkShot = async (file: File) => {
    if (checkedShotRef.current || trackLow) return;
    checkedShotRef.current = true;
    const pixels = await imagePixels(file);
    if (pixels !== null && isBelowFullResolution(pixels)) setShotLow(true);
  };

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!live || !frameReady || closing || !video) return;
    const now = Date.now();
    if (now - lastShotAtRef.current < SHUTTER_COOLDOWN_MS) return;
    lastShotAtRef.current = now;
    const reduced = prefersReducedMotion();
    if (!reduced) {
      setFlashing(true);
      flashTimerRef.current = setTimeout(() => setFlashing(false), FLASH_MS);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
    }
    const frame = captureFrame(video, camera.getTrack());
    onShot(frame);
    try {
      const file = await frame;
      const url = URL.createObjectURL(file);
      const next = [url, ...trayRef.current];
      next.slice(TRAY_SIZE).forEach((old) => URL.revokeObjectURL(old));
      updateTray(next.slice(0, TRAY_SIZE));
      takenRef.current += 1;
      setAnnouncement(t('camera.shotTaken', { n: takenRef.current }));
      void checkShot(file);
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
    takenRef.current = Math.max(0, takenRef.current - 1);
    setAnnouncement(t('camera.lastRemoved', { count: Math.max(0, shotCount + savingCount - 1) }));
    onRemoveLast!();
  };

  const handleDismissHint = () => {
    rememberLowResDismissed();
    setHintDismissed(true);
    shutterRef.current!.focus();
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

  const shotsTotal = shotCount + savingCount;
  const exitLabel = closing
    ? t('camera.saving')
    : shotsTotal > 0
      ? t('camera.review', { n: shotsTotal })
      : t('camera.close');
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

        <div className={styles.topArea}>
          <div className={styles.topBar}>
            <button
              type="button"
              className={styles.textButton}
              onClick={onUseCameraApp}
              aria-describedby={descId}
              data-testid="rapid-camera-use-app"
            >
              {t('camera.useCameraApp')}
            </button>
            <span id={descId} className={styles.srOnly}>
              {t('camera.useCameraAppDescription')}
            </span>
            <button
              type="button"
              className={styles.reviewButton}
              aria-busy={closing || undefined}
              onClick={requestClose}
              data-testid="rapid-camera-review"
            >
              {exitLabel}
            </button>
          </div>
          {waitingCount > 0 ? (
            <p className={styles.waiting} data-testid="rapid-camera-waiting">
              {t('waiting.count', { count: waitingCount })}
            </p>
          ) : null}
          {hintVisible ? (
            <div className={styles.hint} data-testid="rapid-camera-lowres">
              <p>{t('camera.lowRes')}</p>
              <button
                type="button"
                className={styles.panelButton}
                onClick={onUseCameraApp}
                data-testid="rapid-camera-lowres-use-app"
              >
                {t('camera.useCameraApp')}
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={handleDismissHint}
                data-testid="rapid-camera-lowres-dismiss"
              >
                {t('camera.lowResDismiss')}
              </button>
            </div>
          ) : null}
        </div>

        {children ? <div className={styles.chips}>{children}</div> : null}

        {status.kind === 'starting' ? (
          <div className={styles.panel} data-testid="rapid-camera-starting">
            <Spinner size="md" color="muted" label={t('camera.starting')} />
            <p className={styles.panelText}>{t('camera.starting')}</p>
            <p className={styles.panelText} data-testid="rapid-camera-allow-hint">
              {t('camera.allowHint')}
            </p>
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
              <button
                type="button"
                className={styles.panelButton}
                aria-busy={closing || undefined}
                onClick={requestClose}
                data-testid="rapid-camera-error-close"
              >
                {exitLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.controls}>
        <div className={styles.controlStart}>
          <div className={styles.tray} aria-hidden="true" data-testid="rapid-camera-tray">
            {trayUrls.map((url) => (
              <img key={url} src={url} alt="" className={styles.trayImage} />
            ))}
          </div>
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
        </div>
        <button
          ref={shutterRef}
          type="button"
          className={styles.shutter}
          aria-label={t('camera.shutter')}
          aria-disabled={live && frameReady && !closing ? undefined : true}
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
export function RapidCamera({ open, returnFocusRef, onClose, ...stageProps }: RapidCameraProps) {
  const { t } = useTranslation('photos');
  const { savingCount } = stageProps;
  const [closing, setClosing] = useState(false);
  // A closed camera starts its next open fresh (render-time adjustment, no effect).
  if (!open && closing) setClosing(false);
  // The host passes a new onClose lambda on every render; an effect event keeps the timer stable.
  const finishClose = useEffectEvent(() => onClose());
  const requestClose = () => {
    if (savingCount === 0) onClose();
    else setClosing(true);
  };
  useEffect(() => {
    if (closing && savingCount === 0) finishClose();
  }, [closing, savingCount]);
  useEffect(() => {
    if (!closing) return undefined;
    const id = setTimeout(() => finishClose(), CLOSE_WAIT_MAX_MS);
    return () => clearTimeout(id);
  }, [closing]);

  const wide = useWideDialog();
  const sheetId = useId();
  const shutterRef = useRef<HTMLButtonElement>(null);

  if (wide) {
    return open ? (
      <Modal
        title={t('camera.title')}
        hideTitle
        onClose={requestClose}
        className={styles.modal}
        initialFocusRef={shutterRef}
        returnFocusRef={returnFocusRef}
      >
        <CameraStage
          {...stageProps}
          shutterRef={shutterRef}
          closing={closing}
          requestClose={requestClose}
        />
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
      onClose={requestClose}
      initialFocusRef={shutterRef}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="rapid-camera-sheet"
    >
      {open ? (
        <CameraStage
          {...stageProps}
          shutterRef={shutterRef}
          closing={closing}
          requestClose={requestClose}
        />
      ) : null}
    </Sheet>
  );
}
