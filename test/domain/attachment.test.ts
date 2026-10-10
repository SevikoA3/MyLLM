import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  validateAttachmentSet,
  parseAttachments,
} from '../../src/domain/attachment';

const image = {
  id: 'image_1',
  name: 'photo.png',
  mimeType: 'image/png',
  byteSize: 100,
  uri: 'file:///app/image_1.png',
} as const;

describe('attachments', () => {
  it('accepts ten attachments within the 80 MB combined limit', () => {
    const attachments = Array.from({ length: 10 }, (_, index) => ({ ...image, id: `image_${index}`, byteSize: 8 * 1024 * 1024 }));
    expect(validateAttachmentSet(attachments)).toEqual({ ok: true });
    expect(validateAttachment({ ...image, byteSize: 10 * 1024 * 1024 }).ok).toBe(true);
  });

  it('restores document metadata alongside existing image metadata', () => {
    const document = { ...image, id: 'file_1', name: 'notes.pdf', mimeType: 'application/pdf' };
    expect(parseAttachments([image, document])).toEqual([image, document]);
  });

  it('rejects unsupported MIME and oversized images', () => {
    expect(reason(validateAttachment({ ...image, mimeType: 'image/gif' }))).toBe('type_not_allowed');
    expect(reason(validateAttachment({ ...image, byteSize: MAX_ATTACHMENT_BYTES + 1 }))).toBe('size_too_large');
  });

  it('enforces count and message byte limits', () => {
    const valid = validateAttachment(image);
    if (!valid.ok) throw new Error('fixture must be valid');
    expect(reason(validateAttachmentSet(Array.from({ length: 11 }, () => valid.value)))).toBe('too_many');
    expect(
      reason(validateAttachmentSet([
        ...Array.from({ length: 8 }, (_, index) => ({ ...valid.value, id: `file_${index}`, byteSize: 10 * 1024 * 1024 })),
        { ...valid.value, id: 'extra', byteSize: 1 },
      ])),
    ).toBe('message_too_large');
  });
});

function reason(value: { ok: true } | { ok: false; reason: string }): string {
  if (value.ok) throw new Error('fixture must be rejected');
  return value.reason;
}
