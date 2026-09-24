import {
  DEFAULT_WEB_TOOLS_SETTINGS,
  createWebToolsSettings,
  normalizeGatewayEngines,
  normalizeGatewayUrl,
} from '../../src/domain/web-tools';

describe('web tools settings', () => {
  it('normalizes an HTTPS gateway URL without its trailing slash', () => {
    expect(normalizeGatewayUrl(' https://gateway.example.com/ ')).toBe('https://gateway.example.com');
    expect(createWebToolsSettings({ enabled: true, baseUrl: 'https://gateway.example.com/' })).toEqual({
      enabled: true,
      provider: 'gateway',
      baseUrl: 'https://gateway.example.com',
      engines: 'bing',
    });
  });

  it('requires HTTPS and a URL when enabled', () => {
    expect(() => normalizeGatewayUrl('http://gateway.example.com')).toThrow('HTTPS');
    expect(() => createWebToolsSettings({ enabled: true, baseUrl: null })).toThrow('required');
    expect(DEFAULT_WEB_TOOLS_SETTINGS).toEqual({ enabled: false, provider: 'gateway', baseUrl: null, engines: 'bing' });
  });

  it('allows Exa without a gateway URL', () => {
    expect(createWebToolsSettings({ enabled: true, provider: 'exa', baseUrl: null })).toEqual({
      enabled: true,
      provider: 'exa',
      baseUrl: null,
      engines: 'bing',
    });
  });

  it('preserves the configured SearXNG engine names', () => {
    expect(normalizeGatewayEngines(' bing,brave ')).toBe('bing,brave');
    expect(() => normalizeGatewayEngines(' ')).toThrow('SearXNG engines');
  });
});
