import {
  DEFAULT_TOOL_POLICY,
  parseToolArguments,
  requiresApproval,
  validToolName,
} from '../../src/domain/tool';

const readOnly = {
  name: 'get_current_time',
  description: 'Read time',
  parameters: {},
  risk: 'read-only' as const,
  approval: 'ask' as const,
  target: 'Device clock',
  sideEffect: 'Reads device time.',
};

describe('tool domain', () => {
  it('validates tool names and object JSON arguments', () => {
    expect(validToolName('get_current_time')).toBe(true);
    expect(validToolName('../shell')).toBe(false);
    expect(parseToolArguments('{"timezone":"Asia/Jakarta"}')).toEqual({
      ok: true,
      value: { timezone: 'Asia/Jakarta' },
    });
    expect(parseToolArguments('[]')).toEqual({
      ok: false,
      message: 'Tool arguments must be a JSON object.',
    });
  });

  it('always asks for write or dangerous tools', () => {
    expect(requiresApproval(readOnly, DEFAULT_TOOL_POLICY)).toBe(true);
    expect(requiresApproval({ ...readOnly, approval: 'never' }, { approval: 'never' })).toBe(false);
    expect(requiresApproval({ ...readOnly, risk: 'write', approval: 'never' }, { approval: 'never' })).toBe(true);
  });
});
