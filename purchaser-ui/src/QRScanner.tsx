import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QRScannerProps {
  onProductScanned: (productId: string) => void;
}

type ScannerError =
  | { type: 'permission'; message: string }
  | { type: 'invalid-qr'; message: string; scannedValue: string };

export function QRScanner({ onProductScanned }: QRScannerProps) {
  const [error, setError] = useState<ScannerError | null>(null);
  const [scanning, setScanning] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<string>('qr-reader-' + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!scanning) return;

    const scanner = new Html5Qrcode(containerRef.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          if (UUID_REGEX.test(decodedText)) {
            if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
              scanner.stop().catch(() => {});
            }
            onProductScanned(decodedText);
          } else {
            if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
              scanner.stop().catch(() => {});
            }
            setScanning(false);
            setError({
              type: 'invalid-qr',
              message: 'The scanned QR code does not contain a recognized product code. Product codes must be in UUID format.',
              scannedValue: decodedText,
            });
          }
        },
        () => {
          // QR code not detected in this frame - normal
        }
      )
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setScanning(false);

        if (
          errorMessage.toLowerCase().includes('permission') ||
          errorMessage.toLowerCase().includes('notallowederror') ||
          errorMessage.toLowerCase().includes('denied') ||
          errorMessage.toLowerCase().includes('not allowed')
        ) {
          setError({
            type: 'permission',
            message: 'Camera access is required for QR scanning.',
          });
        } else {
          setError({
            type: 'permission',
            message: `Unable to access camera: ${errorMessage}`,
          });
        }
      });

    return () => {
      if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
        scanner.stop().catch(() => {});
      }
    };
  }, [scanning, onProductScanned]);

  function handleRescan() {
    setError(null);
    setScanning(true);
  }

  if (error?.type === 'permission') {
    return (
      <div role="alert" className="card" style={{ textAlign: 'center', borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</p>
        <h3 style={{ color: 'var(--color-error)', marginBottom: '0.75rem' }}>
          Camera Access Required
        </h3>
        <p style={{ marginBottom: '1rem' }}>{error.message}</p>
        <div style={{
          textAlign: 'left',
          backgroundColor: 'var(--color-border-light)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
            To enable camera permissions:
          </p>
          <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
            <li>Click the camera/lock icon in your browser&apos;s address bar</li>
            <li>Set Camera permission to &quot;Allow&quot;</li>
            <li>Reload the page and try scanning again</li>
          </ol>
        </div>
        <button onClick={handleRescan} className="btn btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  if (error?.type === 'invalid-qr') {
    return (
      <div role="alert" className="card" style={{ textAlign: 'center', borderColor: 'var(--color-warning-border)', background: 'var(--color-warning-bg)' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</p>
        <h3 style={{ color: '#92400e', marginBottom: '0.75rem' }}>
          Unrecognized QR Code
        </h3>
        <p style={{ marginBottom: '0.75rem' }}>{error.message}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem', wordBreak: 'break-all' }}>
          Scanned value: <code>{error.scannedValue}</code>
        </p>
        <button onClick={handleRescan} className="btn btn-primary">
          Scan Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        id={containerRef.current}
        className="qr-scanner-container"
        style={{ width: '100%', minHeight: '300px' }}
      />
      <p className="qr-scanner-hint">
        Point your camera at a product QR code to scan
      </p>
    </div>
  );
}
