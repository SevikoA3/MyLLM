import { act, cleanup, renderHook } from '@testing-library/react-native';

import { createEndpointProfile, type EndpointProfile } from '../../../src/domain/endpoint';
import { useActiveEndpoint } from '../../../src/features/setup/use-active-endpoint';

const mockLoad = jest.fn<Promise<EndpointProfile | null>, []>();
let endpointListener: (() => void) | null = null;

jest.mock('../../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { load: () => mockLoad() },
  subscribeEndpointChanges: (listener: () => void) => {
    endpointListener = listener;
    return () => { endpointListener = null; };
  },
}));

describe('useActiveEndpoint', () => {
  afterEach(cleanup);

  it('ignores an older load that resolves after an endpoint change', async () => {
    let resolveFirst: ((profile: EndpointProfile) => void) | undefined;
    let resolveSecond: ((profile: EndpointProfile) => void) | undefined;
    const first = createEndpointProfile({ id: 'ep_1', name: 'First', baseUrl: 'https://first.example/v1' });
    const second = createEndpointProfile({ id: 'ep_2', name: 'Second', baseUrl: 'https://second.example/v1' });
    mockLoad
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const hook = await renderHook(() => useActiveEndpoint());

    await act(async () => { endpointListener?.(); });
    expect(hook.result.current).toEqual({ status: 'loading', profile: null });

    await act(async () => { resolveSecond?.(second); });
    expect(hook.result.current).toEqual({ status: 'ready', profile: second });

    await act(async () => { resolveFirst?.(first); });
    expect(hook.result.current).toEqual({ status: 'ready', profile: second });
  });
});
