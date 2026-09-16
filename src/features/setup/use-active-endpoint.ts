import { useEffect, useState } from 'react';

import type { EndpointProfile } from '../../domain/endpoint';
import { endpointStore } from '../../services/persistence/endpoint-store';

export type ActiveEndpointState =
  | { status: 'loading'; profile: null }
  | { status: 'ready'; profile: EndpointProfile | null };

// Endpoint profile tanpa secret dibaca dari kv-store. Fresh install mengembalikan null.
export function useActiveEndpoint(): ActiveEndpointState {
  const [state, setState] = useState<ActiveEndpointState>({ status: 'loading', profile: null });

  useEffect(() => {
    let alive = true;
    endpointStore
      .load()
      .then((profile) => {
        if (alive) {
          setState({ status: 'ready', profile });
        }
      })
      .catch(() => {
        if (alive) {
          setState({ status: 'ready', profile: null });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

