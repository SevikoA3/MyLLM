import {
  createEndpointProfile,
  parseEndpointExport,
  serializeEndpointExport,
} from '../../src/domain/endpoint';

describe('endpoint export', () => {
  it('exports portable profiles with stable IDs but without credentials', () => {
    const profile = {
      ...createEndpointProfile({
        id: 'ep_1',
        name: 'AmanAI',
        baseUrl: 'https://api.amanai.dev/v1',
        credentialRef: 'cred_secret',
      }),
      headers: { 'X-Custom-Token': 'private-header-value' },
    };
    const text = serializeEndpointExport([profile], '2026-09-24T00:00:00.000Z');
    const parsed = parseEndpointExport(text);

    expect(parsed.endpoints).toHaveLength(1);
    expect(parsed.endpoints[0].id).toBe('ep_1');
    expect(parsed.endpoints[0]).not.toHaveProperty('credentialRef');
    expect(parsed.endpoints[0]).not.toHaveProperty('headers');
    expect(text).not.toContain('cred_secret');
    expect(text).not.toContain('private-header-value');
  });

  it('rejects credentials injected into an imported profile', () => {
    const profile = createEndpointProfile({
      id: 'ep_1',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1',
    });
    const parsed = JSON.parse(serializeEndpointExport([profile])) as {
      endpoints: Record<string, unknown>[];
    };
    parsed.endpoints[0].credentialRef = 'cred_injected';

    expect(() => parseEndpointExport(JSON.stringify(parsed))).toThrow();
  });

  it('rejects duplicate endpoint IDs in one import', () => {
    const profile = createEndpointProfile({ id: 'ep_1', name: 'AmanAI', baseUrl: 'https://api.amanai.dev/v1' });
    const value = JSON.parse(serializeEndpointExport([profile])) as { endpoints: Record<string, unknown>[] };
    value.endpoints.push({ ...value.endpoints[0] });
    expect(() => parseEndpointExport(JSON.stringify(value))).toThrow(/unique/);
  });

  it('rejects unsafe endpoint IDs at the import boundary', () => {
    const profile = createEndpointProfile({ id: 'ep_1', name: 'AmanAI', baseUrl: 'https://api.amanai.dev/v1' });
    const value = JSON.parse(serializeEndpointExport([profile])) as { endpoints: Record<string, unknown>[] };
    value.endpoints[0].id = 'a/b';
    expect(() => parseEndpointExport(JSON.stringify(value))).toThrow(/unsupported characters/);
  });
});
