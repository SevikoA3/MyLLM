import { APP_NAME } from './app-info';

describe('app-info', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('MyLLM');
  });
});
