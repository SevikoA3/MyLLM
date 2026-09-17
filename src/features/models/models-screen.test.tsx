import { render } from '@testing-library/react-native';

import type { MergedModel } from '../../domain/catalog-merge';
import { ModelRow } from './models-screen';

function model(overrides: Partial<MergedModel> = {}): MergedModel {
  return {
    id: 'amanai/glm-5.3',
    displayName: 'amanai/glm-5.3',
    vendor: 'zai',
    ownedBy: 'amanai',
    description: null,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: ['auto', 'low', 'high'],
    inputModalities: ['text'],
    capabilities: {
      streaming: 'unknown',
      tools: 'unknown',
      structuredOutput: 'unknown',
      nativeCompaction: 'unknown',
    },
    raw: {},
    pricing: null,
    provenance: {},
    request: { reasoningEffort: null, outputLimit: null },
    enabled: true,
    orphaned: false,
    ...overrides,
  };
}

describe('ModelRow', () => {
  it('menampilkan metadata yang tersedia sebagai badge yang terbaca', async () => {
    const view = await render(
      <ModelRow
        model={model()}
        active
        selectable
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('1M ctx')).toBeTruthy();
    expect(view.getByText('128k out')).toBeTruthy();
    expect(view.getByText('reasoning 3 level')).toBeTruthy();
    expect(view.getByText('aktif')).toBeTruthy();
  });

  it('menandai context window yang tidak diketahui sebagai unknown', async () => {
    const view = await render(
      <ModelRow
        model={model({ contextWindow: null, maxOutputTokens: null, reasoningEfforts: [] })}
        active={false}
        selectable
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('ctx unknown')).toBeTruthy();
  });

  it('menjelaskan model yang dimatikan dan menyediakan checkbox picker', async () => {
    const view = await render(
      <ModelRow
        model={model({ enabled: false })}
        active={false}
        selectable={false}
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('dimatikan')).toBeTruthy();
    expect(view.getByText('Tampilkan di picker')).toBeTruthy();
    expect(view.getByRole('checkbox').props.accessibilityState).toEqual({ checked: false });
  });
});
