interface ImageCaptureLike {
  takePhoto: () => Promise<Blob>;
}

type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureLike;

function toFile(blob: Blob): File {
  const type = blob.type || 'image/jpeg';
  // Date.now() is read here, in the shutter handler, never during render.
  return new File([blob], `capture-${Date.now()}.jpg`, { type });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The frame could not be encoded'))),
      'image/jpeg',
      0.92,
    );
  });
}

/**
 * Takes one still from a live viewfinder: `ImageCapture.takePhoto()` (full sensor resolution)
 * when the browser has it, otherwise the current video frame drawn to a canvas as a JPEG.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  track: MediaStreamTrack | null,
): Promise<File> {
  const ImageCaptureCtor =
    typeof window !== 'undefined'
      ? (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture
      : undefined;
  if (track && ImageCaptureCtor) {
    try {
      return toFile(await new ImageCaptureCtor(track).takePhoto());
    } catch {
      // Fall through to the canvas path.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context || canvas.width === 0 || canvas.height === 0) {
    throw new Error('No video frame is available');
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return toFile(await canvasBlob(canvas));
}
