import {
  MAX_IMAGE_BYTES,
  validateImageAttachment,
  validateImageAttachmentSet,
} from '../../src/domain/attachment';

const image = {
  id: 'image_1',
  name: 'photo.png',
  mimeType: 'image/png',
  byteSize: 100,
  uri: 'file:///app/image_1.png',
} as const;

describe('image attachments', () => {
  it('rejects unsupported MIME and oversized images', () => {
    expect(reason(validateImageAttachment({ ...image, mimeType: 'image/gif' }))).toBe('type_not_allowed');
    expect(reason(validateImageAttachment({ ...image, byteSize: MAX_IMAGE_BYTES + 1 }))).toBe('size_too_large');
  });

  it('enforces count and message byte limits', () => {
    const valid = validateImageAttachment(image);
    if (!valid.ok) throw new Error('fixture must be valid');
    expect(reason(validateImageAttachmentSet(Array.from({ length: 5 }, () => valid.value)))).toBe('too_many');
    expect(
      reason(validateImageAttachmentSet([
        { ...valid.value, byteSize: 8 * 1024 * 1024 },
        { ...valid.value, id: 'image_2', byteSize: 5 * 1024 * 1024 },
      ])),
    ).toBe('message_too_large');
  });
});

function reason(value: { ok: true } | { ok: false; reason: string }): string {
  if (value.ok) throw new Error('fixture must be rejected');
  return value.reason;
}
