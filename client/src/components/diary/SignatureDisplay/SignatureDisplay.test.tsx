/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n/index.js';
import { SignatureDisplay } from './SignatureDisplay.js';

const props = {
  signatureDataUrl: 'data:image/png;base64,AAAA',
  signerName: 'Alice Builder',
  signedDate: 'Mar 14, 2026',
};

describe('SignatureDisplay', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the signature image with the translated alt text including the signer name', () => {
    render(<SignatureDisplay {...props} />);
    const img = screen.getByAltText('Signature of Alice Builder');
    expect(img).toHaveAttribute('src', props.signatureDataUrl);
  });

  it('renders the signer name and signed date', () => {
    render(<SignatureDisplay {...props} />);
    expect(screen.getByText('Signed by Alice Builder')).toBeInTheDocument();
    expect(screen.getByText('Mar 14, 2026')).toBeInTheDocument();
  });

  it('interpolates the signer name into the alt text (not a hardcoded or literal key)', () => {
    render(<SignatureDisplay {...props} signerName="Bob Vendor" />);
    expect(screen.getByAltText('Signature of Bob Vendor')).toBeInTheDocument();
    expect(screen.queryByAltText('signature.altText')).not.toBeInTheDocument();
  });

  it('uses the German alt text when the locale is de', async () => {
    await i18n.changeLanguage('de');
    render(<SignatureDisplay {...props} />);
    expect(screen.getByAltText('Unterschrift von Alice Builder')).toBeInTheDocument();
    expect(screen.queryByAltText('Signature of Alice Builder')).not.toBeInTheDocument();
  });
});
