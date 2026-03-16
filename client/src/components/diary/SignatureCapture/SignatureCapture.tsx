import React, { useRef, useState, useEffect } from 'react';
import type { DiarySignatureEntry } from '@cornerstone/shared';
import styles from './SignatureCapture.module.css';

export interface VendorOption {
  id: string;
  name: string;
}

export interface SignatureCaptureProps {
  signature?: DiarySignatureEntry | null;
  onSignatureChange: (sig: DiarySignatureEntry | null) => void;
  disabled?: boolean;
  signerName?: string;
  onSignerNameChange?: (name: string) => void;
  signerType?: 'self' | 'vendor';
  onSignerTypeChange?: (type: 'self' | 'vendor') => void;
  currentUserName?: string;
  vendors?: VendorOption[];
}

export function SignatureCapture({
  signature,
  onSignatureChange,
  disabled = false,
  signerName = '',
  onSignerNameChange,
  signerType = 'self',
  onSignerTypeChange,
  currentUserName,
  vendors,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');

  // Auto-populate signerName when type is 'self'
  useEffect(() => {
    if (signerType === 'self' && currentUserName && !signature) {
      onSignerNameChange?.(currentUserName);
    }
  }, [signerType, currentUserName, signature]);

  // Initialize canvas on mount and on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Set canvas resolution for crisp rendering
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Scale context to match device pixel ratio
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);

        // Get CSS variable colors for dark mode support
        const computedStyle = getComputedStyle(canvas);
        const bgColor = computedStyle.getPropertyValue('--color-bg-primary').trim() || '#ffffff';
        const strokeColor =
          computedStyle.getPropertyValue('--color-text-primary').trim() || '#000000';

        // Fill canvas with background color from CSS variables
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = strokeColor;

        // Draw signature line if no signature yet
        if (!signature) {
          drawSignatureLine(ctx, rect.width, rect.height);
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [signature]);

  // Load existing signature image if provided
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !signature) {
      setHasStrokes(false);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw image
      const dpr = window.devicePixelRatio || 1;
      ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);

      setHasStrokes(true);
    };
    img.src = signature.signatureDataUrl;
  }, [signature]);

  const drawSignatureLine = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    // Get CSS variable values via computed style
    const canvas = canvasRef.current;
    const computedStyle = canvas ? getComputedStyle(canvas) : null;
    const borderColor = computedStyle?.getPropertyValue('--color-border') || '#e5e7eb';
    const textColor = computedStyle?.getPropertyValue('--color-text-muted') || '#9ca3af';

    // Draw horizontal line at bottom third
    const lineY = (height * 2) / 3;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();

    // Draw "Sign here" label
    ctx.fillStyle = textColor;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Sign here', 16, lineY - 8);
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches.length) return null;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || signature) return;
    const pos = getMousePos(e);
    if (!pos) return;

    setIsDrawing(true);
    lastPosRef.current = pos;
    drawLine(pos.x, pos.y, pos.x, pos.y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || signature) return;
    const pos = getMousePos(e);
    if (!pos) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const last = lastPosRef.current || pos;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPosRef.current = pos;

    if (!hasStrokes) {
      setHasStrokes(true);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    lastPosRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || signature || !e.touches.length) return;
    e.preventDefault(); // Prevent scrolling while drawing
    const pos = getTouchPos(e);
    if (!pos) return;

    setIsDrawing(true);
    lastPosRef.current = pos;
    drawLine(pos.x, pos.y, pos.x, pos.y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || signature || !e.touches.length) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getTouchPos(e);
    if (!pos) return;

    const last = lastPosRef.current || pos;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPosRef.current = pos;

    if (!hasStrokes) {
      setHasStrokes(true);
    }
  };

  const handleTouchEnd = () => {
    setIsDrawing(false);
    lastPosRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSignatureLine(ctx, rect.width, rect.height);

    setHasStrokes(false);
    setSizeError(null);
  };

  const handleAccept = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;

    const now = new Date();
    const signedAt = now.toISOString();

    // Burn signer info and timestamp onto the canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      const formattedDate = now.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      const labelText = `${signerName} \u2014 ${formattedDate}`;

      ctx.save();
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'right';
      ctx.fillText(labelText, rect.width - 8, rect.height - 6);
      ctx.restore();
    }

    const dataUrl = canvas.toDataURL('image/png');

    // Check size (500KB limit)
    const sizeInBytes = dataUrl.length;
    const sizeInKb = sizeInBytes / 1024;

    if (sizeInKb > 500) {
      setSizeError(`Signature too large (${sizeInKb.toFixed(0)}KB, max 500KB)`);
      return;
    }

    setSizeError(null);
    onSignatureChange({
      signerName,
      signerType,
      signatureDataUrl: dataUrl,
      signedAt,
    });
  };

  const handleRemove = () => {
    setSizeError(null);
    onSignatureChange(null);
  };

  const handleSignerTypeChange = (newType: 'self' | 'vendor') => {
    onSignerTypeChange?.(newType);
    setSelectedVendorId('');
    // Name changes for type switches are handled by the parent via onSignerTypeChange
    // to avoid stale closure issues when both callbacks spread the same sig object
  };

  const handleVendorSelect = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    if (vendorId === '__other__') {
      onSignerNameChange?.('');
    } else if (vendorId) {
      const vendor = vendors?.find((v) => v.id === vendorId);
      if (vendor) {
        onSignerNameChange?.(vendor.name);
      }
    } else {
      onSignerNameChange?.('');
    }
  };

  const isVendorNameEmpty = signerType === 'vendor' && !signerName.trim();
  const isAcceptDisabled = disabled || !hasStrokes || isVendorNameEmpty;

  if (signature) {
    return (
      <div className={styles.container}>
        <div className={styles.signerInfo}>
          <span className={styles.signerName}>{signature.signerName}</span>
          <span className={styles.signerType}>
            ({signature.signerType === 'self' ? 'Self' : 'Vendor'})
          </span>
        </div>
        <div className={styles.signatureDisplay}>
          <img
            src={signature.signatureDataUrl}
            alt={`Signature of ${signature.signerName}`}
            className={styles.signatureImage}
          />
        </div>
        <button
          type="button"
          className={styles.removeButton}
          onClick={handleRemove}
          disabled={disabled}
        >
          Remove Signature
        </button>
      </div>
    );
  }

  const showVendorFreeform =
    signerType === 'vendor' &&
    (!vendors || vendors.length === 0 || selectedVendorId === '__other__');

  return (
    <div className={styles.container}>
      {/* Signer info section */}
      <div className={styles.signerSection}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Signer Type</label>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="signer-type"
                value="self"
                checked={signerType === 'self'}
                onChange={() => handleSignerTypeChange('self')}
                disabled={disabled}
              />
              Self
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="signer-type"
                value="vendor"
                checked={signerType === 'vendor'}
                onChange={() => handleSignerTypeChange('vendor')}
                disabled={disabled}
              />
              Vendor
            </label>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="signer-name" className={styles.label}>
            Signer Name
          </label>
          {signerType === 'self' ? (
            <div className={styles.readOnlyName}>{currentUserName || signerName || '—'}</div>
          ) : vendors && vendors.length > 0 ? (
            <>
              <select
                className={styles.select}
                value={selectedVendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
                disabled={disabled}
              >
                <option value="">— Select Vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value="__other__">Other...</option>
              </select>
              {selectedVendorId === '__other__' && (
                <input
                  id="signer-name"
                  type="text"
                  className={styles.input}
                  value={signerName}
                  onChange={(e) => onSignerNameChange?.(e.target.value)}
                  disabled={disabled}
                  placeholder="Enter vendor name"
                />
              )}
            </>
          ) : (
            <input
              id="signer-name"
              type="text"
              className={styles.input}
              value={signerName}
              onChange={(e) => onSignerNameChange?.(e.target.value)}
              disabled={disabled}
              placeholder="Enter vendor name"
            />
          )}
          {isVendorNameEmpty && (
            <div className={styles.validationHint}>Vendor name is required to accept signature</div>
          )}
        </div>
      </div>

      <div className={styles.canvasWrapper} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Signature canvas"
        />
      </div>

      {sizeError && <div className={styles.errorText}>{sizeError}</div>}

      <div className={styles.buttonGroup}>
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          disabled={disabled || !hasStrokes}
        >
          Clear
        </button>
        <button
          type="button"
          className={styles.acceptButton}
          onClick={handleAccept}
          disabled={isAcceptDisabled}
        >
          Accept Signature
        </button>
      </div>
    </div>
  );
}
