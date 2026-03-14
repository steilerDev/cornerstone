import React, { useRef, useState, useEffect } from 'react';
import styles from './SignatureCapture.module.css';

export interface SignatureCaptureProps {
  signature: string | null;
  onSignatureChange: (sig: string | null) => void;
  disabled?: boolean;
}

export function SignatureCapture({
  signature,
  onSignatureChange,
  disabled = false,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  // Initialize canvas on mount and on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Set canvas resolution
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Scale context to match device pixel ratio
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'var(--color-text-primary)';

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
    img.src = signature;
  }, [signature]);

  const drawSignatureLine = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    // Draw horizontal line at bottom third
    const lineY = (height * 2) / 3;
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();

    // Draw "Sign here" label
    ctx.fillStyle = 'var(--color-text-muted)';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Sign here', 16, lineY - 8);
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) / dpr,
      y: (e.clientY - rect.top) / dpr,
    };
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches.length) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const touch = e.touches[0];
    return {
      x: (touch.clientX - rect.left) / dpr,
      y: (touch.clientY - rect.top) / dpr,
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

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    // Draw to next position using current position
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nextPos = {
      x: (e.clientX - rect.left - 1) / dpr,
      y: (e.clientY - rect.top) / dpr,
    };
    ctx.lineTo(nextPos.x, nextPos.y);
    ctx.stroke();

    if (!hasStrokes) {
      setHasStrokes(true);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || signature || !e.touches.length) return;
    e.preventDefault(); // Prevent scrolling while drawing
    const pos = getTouchPos(e);
    if (!pos) return;

    setIsDrawing(true);
    drawLine(pos.x, pos.y, pos.x, pos.y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || signature || !e.touches.length) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const touch = e.touches[0];

    const x = (touch.clientX - rect.left) / dpr;
    const y = (touch.clientY - rect.top) / dpr;

    ctx.beginPath();
    ctx.moveTo(x, y);

    // Draw to next touch position
    if (e.touches.length > 0) {
      const nextTouch = e.touches[0];
      const nextX = (nextTouch.clientX - rect.left - 1) / dpr;
      const nextY = (nextTouch.clientY - rect.top) / dpr;
      ctx.lineTo(nextX, nextY);
      ctx.stroke();
    }

    if (!hasStrokes) {
      setHasStrokes(true);
    }
  };

  const handleTouchEnd = () => {
    setIsDrawing(false);
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

    const dataUrl = canvas.toDataURL('image/png');

    // Check size (500KB limit)
    const sizeInBytes = dataUrl.length;
    const sizeInKb = sizeInBytes / 1024;

    if (sizeInKb > 500) {
      setSizeError(`Signature too large (${sizeInKb.toFixed(0)}KB, max 500KB)`);
      return;
    }

    setSizeError(null);
    onSignatureChange(dataUrl);
  };

  const handleRemove = () => {
    setSizeError(null);
    onSignatureChange(null);
  };

  if (signature) {
    return (
      <div className={styles.container}>
        <div className={styles.signatureDisplay}>
          <img src={signature} alt="Signature" className={styles.signatureImage} />
        </div>
        <div className={styles.signatureLabel}>Signature</div>
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

  return (
    <div className={styles.container}>
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
          disabled={disabled || !hasStrokes}
        >
          Accept Signature
        </button>
      </div>
    </div>
  );
}
