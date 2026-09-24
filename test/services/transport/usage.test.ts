import { createEndpointProfile } from '../../../src/domain/endpoint';
import { fetchAccountUsage, usageUrl } from '../../../src/services/transport/usage';

const profile = {
  ...createEndpointProfile({
    id: 'ep_1',
    name: 'AmanAI',
    baseUrl: 'https://api.amanai.dev/v1',
    credentialRef: 'cred_1',
  }),
  compat: {
    ...createEndpointProfile({
      id: 'template',
      name: 'Template',
      baseUrl: 'https://example.com/v1',
    }).compat,
    usagePath: '/usage',
  },
};

describe('account usage transport', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not request usage without a documented path', async () => {
    const noUsage = { ...profile, compat: { ...profile.compat, usagePath: null } };
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    expect(usageUrl(noUsage)).toBeNull();
    await expect(fetchAccountUsage(noUsage, 'sk-test')).resolves.toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps common AmanAI account usage fields without inventing missing values', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      balance: 42.5,
      currency: 'credit',
      period_start: '2026-09-01',
    }), { status: 200 }));

    const result = await fetchAccountUsage(profile, 'sk-test');
    expect(result).toEqual({
      ok: true,
      usage: {
        balance: 42.5,
        currency: 'credit',
        periodStart: '2026-09-01',
        periodEnd: null,
      },
    });
  });
});
