import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('membawa versi dan model ID exact', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(1);
    expect(buildSystemPrompt('amanai/gpt-5.6-terra')).toContain(
      'Configured model ID: "amanai/gpt-5.6-terra"',
    );
  });

  it('meng-escape control character pada model ID', () => {
    const prompt = buildSystemPrompt('model\ninstruction');
    expect(prompt).toContain('Configured model ID: "model\\ninstruction"');
    expect(prompt).not.toContain('Configured model ID: "model\ninstruction"');
  });
});
