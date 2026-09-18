import {
  EndpointProfileSchema,
  buildAuthHeaders,
  buildCustomHeaders,
  createEndpointProfile,
  joinEndpointPath,
  normalizeBaseUrl,
  validateBaseUrl,
} from './endpoint';

describe('normalizeBaseUrl', () => {
  it('menerima URL dengan dan tanpa trailing slash', () => {
    expect(normalizeBaseUrl('https://api.example.com')).toBe('https://api.example.com');
    expect(normalizeBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(normalizeBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it('mempertahankan /v1 yang sudah diberikan pengguna', () => {
    expect(normalizeBaseUrl('https://api.amanai.dev/v1')).toBe('https://api.amanai.dev/v1');
  });

  it('memangkas whitespace di sekitar input', () => {
    expect(normalizeBaseUrl('  https://api.example.com/v1  ')).toBe('https://api.example.com/v1');
  });

  it('mempertahankan query dan port', () => {
    expect(normalizeBaseUrl('https://api.example.com:8443/v1/?tenant=a')).toBe(
      'https://api.example.com:8443/v1?tenant=a',
    );
  });

  it('menolak URL relatif', () => {
    expect(() => normalizeBaseUrl('api.example.com/v1')).toThrow(/absolut/);
    expect(() => normalizeBaseUrl('/v1')).toThrow(/absolut/);
  });

  it('menolak embedded username dan password', () => {
    expect(() => normalizeBaseUrl('https://user:secret@api.example.com/v1')).toThrow(/username or password/);
    expect(validateBaseUrl('https://user:secret@api.example.com')).toMatch(/username or password/);
  });

  it('menolak skema selain HTTPS', () => {
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow(/http scheme/);
    expect(() => normalizeBaseUrl('ftp://api.example.com')).toThrow(/ftp scheme/);
    expect(() => normalizeBaseUrl('http://192.168.0.10:8080/v1')).toThrow(/http scheme/);
  });

  it('menerima HTTP hanya untuk loopback pada build development', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:4123/v1')).toBe('http://127.0.0.1:4123/v1');
    expect(normalizeBaseUrl('http://localhost:4123/v1')).toBe('http://localhost:4123/v1');
  });

  it('menolak hostname kosong dan input kosong', () => {
    expect(() => normalizeBaseUrl('')).toThrow(/empty/);
    expect(() => normalizeBaseUrl('https://')).toThrow();
  });
});

describe('joinEndpointPath', () => {
  it('tidak menghasilkan /v1/v1 ketika base URL sudah memuat /v1', () => {
    expect(joinEndpointPath('https://api.amanai.dev/v1', '/models')).toBe('https://api.amanai.dev/v1/models');
    expect(joinEndpointPath('https://api.amanai.dev/v1/', 'models')).toBe('https://api.amanai.dev/v1/models');
  });

  it('menambahkan path pada base URL tanpa path', () => {
    expect(joinEndpointPath('https://api.example.com', '/models')).toBe('https://api.example.com/models');
    expect(joinEndpointPath('https://api.example.com/', '/responses')).toBe('https://api.example.com/responses');
  });

  it('menormalkan slash ganda di dalam path', () => {
    expect(joinEndpointPath('https://api.example.com/v1', '//models//')).toBe('https://api.example.com/v1/models');
  });

  it('mempertahankan query string base URL', () => {
    expect(joinEndpointPath('https://api.example.com/v1?tenant=a', '/models')).toBe(
      'https://api.example.com/v1/models?tenant=a',
    );
  });
});

describe('buildAuthHeaders', () => {
  it('memakai Bearer untuk mode bearer', () => {
    expect(buildAuthHeaders('bearer', ' sk-test ')).toEqual({ Authorization: 'Bearer sk-test' });
  });

  it('memakai x-api-key untuk mode x-api-key', () => {
    expect(buildAuthHeaders('x-api-key', 'key-123')).toEqual({ 'x-api-key': 'key-123' });
  });

  it('menolak key kosong', () => {
    expect(() => buildAuthHeaders('bearer', '   ')).toThrow(/empty/);
  });
});

describe('buildCustomHeaders', () => {
  it('membuang header yang menentukan target atau kredensial', () => {
    expect(
      buildCustomHeaders({
        'User-Agent': 'MyLLM-Android/1',
        Host: 'evil.example.com',
        'Content-Length': '10',
        Authorization: 'Bearer stolen',
        'x-api-key': 'stolen',
        'Proxy-Authorization': 'Basic x',
      }),
    ).toEqual({ 'User-Agent': 'MyLLM-Android/1' });
  });
});

describe('createEndpointProfile', () => {
  it('membuat profile valid dengan default Responses API', () => {
    const profile = createEndpointProfile({
      id: 'amanai-main',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1/',
    });

    expect(EndpointProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.baseUrl).toBe('https://api.amanai.dev/v1');
    expect(profile.protocol).toBe('responses');
    expect(profile.authMode).toBe('bearer');
    expect(profile.credentialRef).toBeNull();
  });

  it('tidak menyimpan secret di dalam profile', () => {
    const profile = createEndpointProfile({
      id: 'custom',
      name: 'Custom',
      baseUrl: 'https://api.example.com/v1',
      credentialRef: 'credential-uuid',
    });

    expect(JSON.stringify(profile)).not.toMatch(/sk-|Bearer |x-api-key/);
    expect(profile.credentialRef).toBe('credential-uuid');
  });
});
