import { describe, it, expect } from '@jest/globals';
import type { DiarySignatureEntry } from '@cornerstone/shared';
import {
  EMPTY_FIELDS,
  buildMetadata,
  buildSavePayload,
  droppedDetails,
  fieldsFromEntry,
  hasContent,
  isInvalidTimePair,
  isSignatureComplete,
  pruneFields,
  typeHasSignatures,
  typeHasTimes,
  validateForSave,
} from './captureMetadata.js';
import type { CaptureFields } from './captureMetadata.js';

function fields(overrides: Partial<CaptureFields> = {}): CaptureFields {
  return { ...EMPTY_FIELDS, materials: [], ...overrides };
}

const SIGNED: DiarySignatureEntry = {
  signerName: 'Sam Signer',
  signerType: 'self',
  signatureDataUrl: 'data:image/png;base64,AAA',
};
const BLANK_SLOT: DiarySignatureEntry = {
  signerName: '',
  signerType: 'vendor',
  signatureDataUrl: '',
};

describe('isInvalidTimePair', () => {
  it('is invalid when the end is not after the start', () => {
    expect(isInvalidTimePair('08:00', '08:00')).toBe(true);
    expect(isInvalidTimePair('08:00', '07:59')).toBe(true);
  });

  it('is valid for an ordered pair or when a side is missing', () => {
    expect(isInvalidTimePair('08:00', '16:00')).toBe(false);
    expect(isInvalidTimePair('08:00', null)).toBe(false);
    expect(isInvalidTimePair(null, '07:00')).toBe(false);
  });
});

describe('type capabilities', () => {
  it('knows which types carry times and signatures', () => {
    expect(typeHasTimes('daily_log')).toBe(true);
    expect(typeHasTimes('site_visit')).toBe(true);
    expect(typeHasTimes('delivery')).toBe(false);
    expect(typeHasSignatures('issue')).toBe(true);
    expect(typeHasSignatures('delivery')).toBe(false);
    expect(typeHasSignatures('general_note')).toBe(false);
  });
});

describe('isSignatureComplete', () => {
  it('needs a signer name and a drawn signature', () => {
    expect(isSignatureComplete(SIGNED)).toBe(true);
    expect(isSignatureComplete(BLANK_SLOT)).toBe(false);
    expect(isSignatureComplete({ ...SIGNED, signerName: '   ' })).toBe(false);
    expect(isSignatureComplete({ ...SIGNED, signatureDataUrl: ' ' })).toBe(false);
    expect(isSignatureComplete({ ...SIGNED, signerName: undefined } as never)).toBe(false);
  });
});

describe('fieldsFromEntry', () => {
  it('returns empty fields for an entry without metadata', () => {
    const result = fieldsFromEntry({ entryType: 'daily_log', metadata: null });

    expect(result.fields).toEqual(EMPTY_FIELDS);
    expect(result.signatures).toEqual([]);
  });

  it('reads a daily log, including the company name resolved by the server', () => {
    const result = fieldsFromEntry({
      entryType: 'daily_log',
      metadata: {
        weather: 'sunny',
        temperatureCelsius: 0,
        workersOnSite: 3,
        vendorId: 'v1',
        vendorName: 'Alpha',
        workStart: '07:00',
        workEnd: '15:00',
        signatures: [SIGNED],
      },
    });

    expect(result.fields).toMatchObject({
      weather: 'sunny',
      temperature: '0',
      workers: 3,
      vendorId: 'v1',
      vendorName: 'Alpha',
      workStart: '07:00',
      workEnd: '15:00',
    });
    expect(result.signatures).toEqual([SIGNED]);
  });

  it('reads a daily log with sparse metadata', () => {
    const result = fieldsFromEntry({ entryType: 'daily_log', metadata: {} });

    expect(result.fields).toEqual(EMPTY_FIELDS);
  });

  it('reads a site visit', () => {
    const result = fieldsFromEntry({
      entryType: 'site_visit',
      metadata: {
        inspectorName: 'Ines Inspector',
        outcome: 'pass',
        workStart: '09:00',
        workEnd: '10:00',
        signatures: [SIGNED],
      },
    });

    expect(result.fields).toMatchObject({
      inspectorName: 'Ines Inspector',
      outcome: 'pass',
      workStart: '09:00',
      workEnd: '10:00',
    });
    expect(result.signatures).toHaveLength(1);
  });

  it('reads a site visit with sparse metadata', () => {
    expect(fieldsFromEntry({ entryType: 'site_visit', metadata: {} }).fields).toEqual(EMPTY_FIELDS);
  });

  it('reads a delivery', () => {
    const result = fieldsFromEntry({
      entryType: 'delivery',
      metadata: { vendor: 'Alpha', materials: ['Bricks'], deliveryConfirmed: true },
    });

    expect(result.fields).toMatchObject({
      vendor: 'Alpha',
      materials: ['Bricks'],
      deliveryConfirmed: true,
    });
    expect(result.signatures).toEqual([]);
  });

  it('reads a sparse delivery as not delivered', () => {
    const result = fieldsFromEntry({ entryType: 'delivery', metadata: {} });

    expect(result.fields.deliveryConfirmed).toBe(false);
    expect(result.fields.materials).toEqual([]);
  });

  it('reads a defect', () => {
    const result = fieldsFromEntry({
      entryType: 'issue',
      metadata: { severity: 'high', resolutionStatus: 'in_progress', signatures: [SIGNED] },
    });

    expect(result.fields).toMatchObject({ severity: 'high', resolutionStatus: 'in_progress' });
    expect(result.signatures).toHaveLength(1);
  });

  it('reads a sparse defect', () => {
    expect(fieldsFromEntry({ entryType: 'issue', metadata: {} }).fields).toEqual(EMPTY_FIELDS);
  });

  it('ignores metadata of a note', () => {
    const result = fieldsFromEntry({ entryType: 'general_note', metadata: { x: 1 } as never });

    expect(result.fields).toEqual(EMPTY_FIELDS);
  });
});

describe('buildMetadata', () => {
  it('returns null when nothing was entered', () => {
    for (const type of ['daily_log', 'site_visit', 'delivery', 'issue', 'general_note'] as const) {
      expect(buildMetadata(type, fields(), [])).toBeNull();
    }
  });

  it('builds a daily log with only complete signatures and never the company name', () => {
    const metadata = buildMetadata(
      'daily_log',
      fields({
        weather: 'rainy',
        temperature: ' 12,5 ',
        workers: 4,
        vendorId: 'v1',
        vendorName: 'Alpha',
        workStart: '07:00',
        workEnd: '15:00',
        inspectorName: 'ignored',
      }),
      [SIGNED, BLANK_SLOT],
    );

    expect(metadata).toEqual({
      weather: 'rainy',
      temperatureCelsius: 12.5,
      workersOnSite: 4,
      vendorId: 'v1',
      workStart: '07:00',
      workEnd: '15:00',
      signatures: [SIGNED],
    });
    expect(metadata).not.toHaveProperty('vendorName');
  });

  it('keeps a temperature of zero and drops an unparseable one', () => {
    expect(buildMetadata('daily_log', fields({ temperature: '0' }), [])).toEqual({
      temperatureCelsius: 0,
    });
    expect(buildMetadata('daily_log', fields({ temperature: 'warm' }), [])).toBeNull();
    expect(buildMetadata('daily_log', fields({ temperature: '  ' }), [])).toBeNull();
  });

  it('builds a site visit with its times and a trimmed inspector', () => {
    const metadata = buildMetadata(
      'site_visit',
      fields({
        inspectorName: '  Ines Inspector ',
        outcome: 'fail',
        workStart: '09:00',
        workEnd: '10:30',
        weather: 'sunny',
      }),
      [SIGNED],
    );

    expect(metadata).toEqual({
      inspectorName: 'Ines Inspector',
      outcome: 'fail',
      workStart: '09:00',
      workEnd: '10:30',
      signatures: [SIGNED],
    });
  });

  it('builds a delivery with the company name, materials and the delivered flag', () => {
    const metadata = buildMetadata(
      'delivery',
      fields({ vendor: 'Alpha', materials: ['Bricks'], deliveryConfirmed: true }),
      [SIGNED],
    );

    expect(metadata).toEqual({ vendor: 'Alpha', materials: ['Bricks'], deliveryConfirmed: true });
  });

  it('omits an unticked delivered flag', () => {
    expect(buildMetadata('delivery', fields({ vendor: 'Alpha' }), [])).toEqual({ vendor: 'Alpha' });
  });

  it('builds a defect with severity, status and complete signatures', () => {
    const metadata = buildMetadata('issue', fields({ severity: 'low', resolutionStatus: 'open' }), [
      SIGNED,
      BLANK_SLOT,
    ]);

    expect(metadata).toEqual({ severity: 'low', resolutionStatus: 'open', signatures: [SIGNED] });
  });

  it('never builds metadata for a note', () => {
    expect(buildMetadata('general_note', fields({ weather: 'sunny' }), [SIGNED])).toBeNull();
  });
});

describe('buildSavePayload', () => {
  it('trims the title and text and builds the metadata of the type', () => {
    const payload = buildSavePayload({
      entryType: 'delivery',
      entryDate: '2026-10-19',
      title: '  Bricks ',
      body: ' arrived \n',
      fields: fields({ vendor: 'Alpha' }),
      signatures: [],
    });

    expect(payload).toEqual({
      entryDate: '2026-10-19',
      title: 'Bricks',
      body: 'arrived',
      metadata: { vendor: 'Alpha' },
    });
  });

  it('turns an empty title into null', () => {
    const payload = buildSavePayload({
      entryType: 'general_note',
      entryDate: '2026-10-19',
      title: '   ',
      body: 'text',
      fields: fields(),
      signatures: [],
    });

    expect(payload.title).toBeNull();
    expect(payload.metadata).toBeNull();
  });
});

describe('validateForSave', () => {
  it('has no errors for a daily log, a delivery or a note', () => {
    expect(validateForSave('daily_log', 'draft', fields(), [])).toEqual({});
    expect(validateForSave('delivery', 'new', fields(), [])).toEqual({});
    expect(validateForSave('general_note', 'saved', fields(), [])).toEqual({});
  });

  it('requires inspector and outcome for a site visit', () => {
    expect(validateForSave('site_visit', 'draft', fields({ inspectorName: '  ' }), [])).toEqual({
      inspector: 'capture.errors.inspectorRequired',
      outcome: 'capture.errors.outcomeRequired',
    });
    expect(
      validateForSave(
        'site_visit',
        'draft',
        fields({ inspectorName: 'Ines', outcome: 'pass' }),
        [],
      ),
    ).toEqual({});
  });

  it('requires severity, and status on new and draft entries only', () => {
    expect(validateForSave('issue', 'new', fields(), [])).toEqual({
      severity: 'capture.errors.severityRequired',
      status: 'capture.errors.statusRequired',
    });
    expect(validateForSave('issue', 'draft', fields({ severity: 'low' }), [])).toEqual({
      status: 'capture.errors.statusRequired',
    });
    expect(validateForSave('issue', 'saved', fields({ severity: 'low' }), [])).toEqual({});
  });

  it('rejects an end that is not after the start for daily logs and site visits', () => {
    const times = fields({ workStart: '10:00', workEnd: '09:00' });

    expect(validateForSave('daily_log', 'draft', times, [])).toEqual({
      time: 'capture.endBeforeStart',
    });
    expect(
      validateForSave('site_visit', 'draft', { ...times, inspectorName: 'I', outcome: 'pass' }, []),
    ).toEqual({ time: 'capture.endBeforeStart' });
    expect(validateForSave('delivery', 'draft', times, [])).toEqual({});
  });

  it('rejects an unaccepted signature slot on a type that has signatures', () => {
    expect(validateForSave('daily_log', 'draft', fields(), [SIGNED, BLANK_SLOT])).toEqual({
      signatures: 'edit.signatureIncomplete',
    });
    expect(validateForSave('daily_log', 'draft', fields(), [SIGNED])).toEqual({});
    expect(validateForSave('delivery', 'draft', fields(), [BLANK_SLOT])).toEqual({});
  });
});

describe('hasContent', () => {
  it('is true for a title, text or an uploaded photo', () => {
    expect(hasContent('Title', '', 0)).toBe(true);
    expect(hasContent('', 'Text', 0)).toBe(true);
    expect(hasContent('', '', 1)).toBe(true);
  });

  it('is false for blank fields and no uploaded photo', () => {
    expect(hasContent('  ', ' \n', 0)).toBe(false);
  });
});

describe('droppedDetails', () => {
  it('lists nothing when the details survive the switch or there are none', () => {
    expect(droppedDetails('daily_log', 'site_visit', fields(), [])).toEqual([]);
    expect(
      droppedDetails(
        'daily_log',
        'site_visit',
        fields({ workStart: '07:00', workEnd: '09:00' }),
        [],
      ),
    ).toEqual([]);
  });

  it('collapses start and end into one label', () => {
    const result = droppedDetails(
      'daily_log',
      'delivery',
      fields({ workStart: '07:00', workEnd: '09:00' }),
      [],
    );

    expect(result).toEqual([{ key: 'times' }]);
  });

  it('labels every dropped daily log detail once', () => {
    const result = droppedDetails(
      'daily_log',
      'general_note',
      fields({
        weather: 'sunny',
        temperature: '9',
        workers: 2,
        vendorId: 'v1',
        vendorName: 'Alpha',
      }),
      [],
    );

    expect(result.map((d) => d.key).sort()).toEqual(
      ['company', 'temperature', 'weather', 'workers'].sort(),
    );
  });

  it('counts signature slots, accepted or not', () => {
    const result = droppedDetails('daily_log', 'delivery', fields(), [SIGNED, BLANK_SLOT]);

    expect(result).toEqual([{ key: 'signatures', count: 2 }]);
  });

  it('does not count signatures when the target keeps them', () => {
    expect(droppedDetails('daily_log', 'site_visit', fields(), [SIGNED])).toEqual([]);
  });

  it('counts unaccepted slots of a type that otherwise has no metadata', () => {
    const result = droppedDetails('site_visit', 'general_note', fields(), [BLANK_SLOT]);

    expect(result).toEqual([{ key: 'signatures', count: 1 }]);
  });

  it('skips a defect status that is still the default open', () => {
    expect(
      droppedDetails('issue', 'general_note', fields({ resolutionStatus: 'open' }), []),
    ).toEqual([]);
  });

  it('lists a defect status that was changed, with the severity', () => {
    const result = droppedDetails(
      'issue',
      'delivery',
      fields({ resolutionStatus: 'resolved', severity: 'high' }),
      [],
    );

    expect(result.map((d) => d.key).sort()).toEqual(['severity', 'status']);
  });

  it('lists site visit and delivery details', () => {
    expect(
      droppedDetails(
        'site_visit',
        'delivery',
        fields({ inspectorName: 'Ines', outcome: 'pass' }),
        [],
      )
        .map((d) => d.key)
        .sort(),
    ).toEqual(['inspector', 'outcome']);
    expect(
      droppedDetails(
        'delivery',
        'general_note',
        fields({ vendor: 'Alpha', materials: ['Bricks'], deliveryConfirmed: true }),
        [],
      )
        .map((d) => d.key)
        .sort(),
    ).toEqual(['company', 'deliveryConfirmed', 'materials']);
  });
});

describe('pruneFields', () => {
  it('resets the values the target type does not keep', () => {
    const result = pruneFields(
      fields({ weather: 'sunny', workStart: '07:00', vendor: 'Alpha', materials: ['Bricks'] }),
      'site_visit',
    );

    expect(result.weather).toBeNull();
    expect(result.vendor).toBeNull();
    expect(result.materials).toEqual([]);
    expect(result.workStart).toBe('07:00');
  });

  it('keeps the values the target type keeps', () => {
    const result = pruneFields(fields({ workers: 3, workStart: '07:00' }), 'daily_log');

    expect(result.workers).toBe(3);
    expect(result.workStart).toBe('07:00');
  });

  it('does not share the materials array with the input', () => {
    const input = fields({ materials: ['Bricks'] });

    const result = pruneFields(input, 'delivery');
    result.materials.push('Sand');

    expect(input.materials).toEqual(['Bricks']);
  });

  it('starts a defect with the status open and keeps a chosen status', () => {
    expect(pruneFields(fields(), 'issue').resolutionStatus).toBe('open');
    expect(pruneFields(fields({ resolutionStatus: 'resolved' }), 'issue').resolutionStatus).toBe(
      'resolved',
    );
  });

  it('clears everything for a note', () => {
    const result = pruneFields(fields({ severity: 'low', inspectorName: 'Ines' }), 'general_note');

    expect(result).toEqual(EMPTY_FIELDS);
  });
});
