import React from 'react';
import styles from './SignatureDisplay.module.css';

export interface SignatureDisplayProps {
  signatureDataUrl: string;
  signerName: string;
  signedDate: string;
}

export function SignatureDisplay({
  signatureDataUrl,
  signerName,
  signedDate,
}: SignatureDisplayProps) {
  return (
    <div className={styles.container}>
      <div className={styles.signatureBox}>
        <img src={signatureDataUrl} alt={`Signature of ${signerName}`} className={styles.image} />
      </div>
      <div className={styles.info}>
        <div className={styles.label}>Signed by {signerName}</div>
        <div className={styles.date}>{signedDate}</div>
      </div>
    </div>
  );
}
