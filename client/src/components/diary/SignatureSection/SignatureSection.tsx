import type { DiarySignatureEntry } from '@cornerstone/shared';
import shared from '../../../styles/shared.module.css';
import { SignatureCapture } from '../SignatureCapture/SignatureCapture.js';
import type { VendorOption } from '../SignatureCapture/SignatureCapture.js';
import styles from './SignatureSection.module.css';

export interface SignatureSectionProps {
  /** Existing signatures */
  signatures: DiarySignatureEntry[] | null | undefined;
  /** Callback when a signature is updated or deleted */
  onSignatureChange: (index: number, updated: DiarySignatureEntry | null) => void;
  /** Callback to add a new signature */
  onAddSignature: () => void;
  /** Optional: callback when signatures are completely replaced */
  onSignaturesChange?: (signatures: DiarySignatureEntry[] | null) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Section label */
  label?: string;
  /** Current user's display name */
  currentUserName?: string;
  /** Available vendors for vendor signature type */
  vendors?: VendorOption[];
}

export function SignatureSection({
  signatures,
  onSignatureChange,
  onAddSignature,
  onSignaturesChange,
  disabled = false,
  label = 'Signatures',
  currentUserName,
  vendors,
}: SignatureSectionProps) {
  const handleSignatureUpdate = (index: number, updated: DiarySignatureEntry | null) => {
    onSignatureChange(index, updated);

    // If onSignaturesChange callback is provided, use it for complete state updates
    if (onSignaturesChange) {
      if (updated) {
        const newSigs = [...(signatures || [])];
        newSigs[index] = updated;
        onSignaturesChange(newSigs);
      } else {
        const newSigs = (signatures || []).filter((_, i) => i !== index);
        onSignaturesChange(newSigs.length > 0 ? newSigs : null);
      }
    }
  };

  return (
    <div className={styles.signatureSection}>
      <span className={styles.label}>{label}</span>
      {(signatures?.length ?? 0) > 0 && (
        <div className={styles.signaturesList}>
          {signatures!.map((sig, index) => (
            <div key={index} className={styles.signatureItem}>
              <SignatureCapture
                signature={sig}
                onSignatureChange={(updated) => {
                  handleSignatureUpdate(index, updated);
                }}
                disabled={disabled}
                currentUserName={currentUserName}
                vendors={vendors}
              />
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className={shared.btnSecondary}
        onClick={onAddSignature}
        disabled={disabled}
        aria-label="Add signature"
      >
        + Add Signature
      </button>
    </div>
  );
}
