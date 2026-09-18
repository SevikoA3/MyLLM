import type { ConcreteProtocol, EndpointProfile } from '../../domain/endpoint';
import { endpointStore } from '../persistence/endpoint-store';
import { chatCompletionsTransport } from './chat-completions';
import type {
  ResponseStreamEvent,
  SendResponseInput,
  SendResponseOptions,
  SendResponseResult,
  Transport,
} from './contract';
import { responsesTransport } from './responses';

export type ProtocolCache = {
  loadProtocol: (endpointId: string) => Promise<ConcreteProtocol | null>;
  saveProtocol: (endpointId: string, protocol: ConcreteProtocol) => Promise<void>;
};

export type ProtocolTransportDependencies = {
  cache?: ProtocolCache;
  responses?: Transport;
  chatCompletions?: Transport;
};

const FALLBACK_STATUSES = new Set([404, 405, 501]);

export function isProtocolFallbackError(result: SendResponseResult): boolean {
  return (
    !result.ok &&
    !result.cancelled &&
    !result.hadModelEvent &&
    result.error.httpStatus !== null &&
    FALLBACK_STATUSES.has(result.error.httpStatus)
  );
}

export function createProtocolTransport(
  dependencies: ProtocolTransportDependencies = {},
): Transport {
  const cache = dependencies.cache ?? endpointStore;
  const transports: Record<ConcreteProtocol, Transport> = {
    responses: dependencies.responses ?? responsesTransport,
    'chat-completions': dependencies.chatCompletions ?? chatCompletionsTransport,
  };

  async function send(
    profile: EndpointProfile,
    apiKey: string,
    input: SendResponseInput,
    options: SendResponseOptions = {},
  ): Promise<SendResponseResult> {
    if (profile.protocol !== 'auto') {
      return transports[profile.protocol].send(profile, apiKey, input, options);
    }

    const cached = await loadCached(cache, profile.id);
    const firstProtocol = cached ?? 'responses';
    const first = await run(
      transports[firstProtocol],
      profile,
      apiKey,
      input,
      options,
    );
    if (!isProtocolFallbackError(first)) {
      if (first.ok) {
        await saveCached(cache, profile.id, firstProtocol);
      }
      return first;
    }

    const secondProtocol = opposite(firstProtocol);
    const second = await run(
      transports[secondProtocol],
      profile,
      apiKey,
      input,
      options,
    );
    if (second.ok) {
      await saveCached(cache, profile.id, secondProtocol);
    }
    return {
      ...second,
      attempts: first.attempts + second.attempts,
      diagnostics: [...first.diagnostics, ...second.diagnostics],
    };
  }

  return { send };
}

async function run(
  transport: Transport,
  profile: EndpointProfile,
  apiKey: string,
  input: SendResponseInput,
  options: SendResponseOptions,
): Promise<SendResponseResult> {
  let delayedFailure: Extract<ResponseStreamEvent, { type: 'response.failed' }> | null = null;
  const result = await transport.send(profile, apiKey, input, {
    ...options,
    onEvent: (event) => {
      if (event.type === 'response.failed') {
        delayedFailure = event;
        return;
      }
      options.onEvent?.(event);
    },
  });
  if (!isProtocolFallbackError(result)) {
    if (delayedFailure !== null) {
      options.onEvent?.(delayedFailure);
    }
  }
  return result;
}

function opposite(protocol: ConcreteProtocol): ConcreteProtocol {
  return protocol === 'responses' ? 'chat-completions' : 'responses';
}

async function loadCached(cache: ProtocolCache, endpointId: string): Promise<ConcreteProtocol | null> {
  try {
    return await cache.loadProtocol(endpointId);
  } catch {
    return null;
  }
}

async function saveCached(
  cache: ProtocolCache,
  endpointId: string,
  protocol: ConcreteProtocol,
): Promise<void> {
  try {
    await cache.saveProtocol(endpointId, protocol);
  } catch {
    // Cache kompatibilitas hanya optimasi, bukan alasan menggagalkan request.
  }
}

export const protocolTransport = createProtocolTransport();
export const protocolClient = protocolTransport;

export type { ResponseStreamEvent, SendResponseResult } from './contract';
