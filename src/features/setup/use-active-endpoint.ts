import { useEffect, useState } from 'react';

import type { EndpointProfile } from '../../domain/endpoint';
import { endpointStore, subscribeEndpointChanges } from '../../services/persistence/endpoint-store';

export type ActiveEndpointState =
  | { status: 'loading'; profile: null }
  | { status: 'ready'; profile: EndpointProfile | null };

/** Nilai awal untuk layar yang sudah menerima profile dari parent. */
export function readyState(profile: EndpointProfile | null): ActiveEndpointState {
  return { status: 'ready', profile };
}

// Endpoint profile tanpa secret dibaca dari kv-store. Fresh install mengembalikan null.
export function useActiveEndpoint(): ActiveEndpointState {
  const [state, setState] = useState<ActiveEndpointState>({ status: 'loading', profile: null });

  useEffect(() => {
    let alive = true;
    let requestVersion = 0;
    const load = () => {
      const version = ++requestVersion;
      return endpointStore.load().then((profile) => {
        if (alive && version === requestVersion) {
          setState({ status: 'ready', profile });
        }
      })
      .catch(() => {
        if (alive && version === requestVersion) {
          setState({ status: 'ready', profile: null });
        }
      });
    };
    void load();
    const unsubscribe = subscribeEndpointChanges(() => {
      setState({ status: 'loading', profile: null });
      void load();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return state;
}
