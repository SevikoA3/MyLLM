import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '../../domain/conversation';
import type { EndpointProfile } from '../../domain/endpoint';
import { createAppError, type AppError } from '../../domain/error';
import { credentialStore } from '../../services/credentials/store';
import { settingsStore } from '../../services/persistence/settings-store';
import { responsesClient } from '../../services/transport/responses';

const MAX_OUTPUT_TOKENS = 1024;
let messageSequence = 0;

export type ChatState = {
  messages: ChatMessage[];
  activeModelId: string | null;
  loadingModel: boolean;
  pending: boolean;
  error: AppError | null;
  canRetry: boolean;
  send: (prompt: string) => Promise<boolean>;
  retry: () => Promise<boolean>;
  newChat: () => void;
  reloadModel: () => Promise<void>;
};

export function useChat(profile: EndpointProfile | null): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(profile !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);
  const previousResponseId = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const alive = useRef(true);

  const reloadModel = useCallback(async () => {
    if (profile === null) {
      setActiveModelId(null);
      setLoadingModel(false);
      return;
    }
    try {
      const modelId = await settingsStore.loadActiveModelId();
      if (alive.current) {
        setActiveModelId(modelId);
      }
    } catch {
      if (alive.current) {
        setActiveModelId(null);
      }
    } finally {
      if (alive.current) {
        setLoadingModel(false);
      }
    }
  }, [profile]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = useCallback(
    async (prompt: string, appendUser: boolean): Promise<boolean> => {
      if (pendingRef.current || profile === null || activeModelId === null) {
        return false;
      }
      pendingRef.current = true;
      setPending(true);
      setError(null);
      if (appendUser) {
        setMessages((current) => [...current, message('user', prompt)]);
      }

      try {
        const apiKey =
          profile.credentialRef === null
            ? null
            : await credentialStore.read(profile.credentialRef);
        if (apiKey === null) {
          if (alive.current) {
            setError(missingCredentialError());
            setRetryPrompt(prompt);
          }
          return false;
        }

        const result = await responsesClient.send(profile, apiKey, {
          modelId: activeModelId,
          prompt,
          previousResponseId: previousResponseId.current,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
        if (!alive.current) {
          return false;
        }
        if (!result.ok) {
          setError(result.error);
          setRetryPrompt(prompt);
          return false;
        }

        previousResponseId.current = result.response.id;
        setRetryPrompt(null);
        setMessages((current) => [
          ...current,
          message('assistant', result.response.text ?? '', result.response.reasoningSummary),
        ]);
        return true;
      } catch {
        if (alive.current) {
          setError(localRequestError());
          setRetryPrompt(prompt);
        }
        return false;
      } finally {
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
        }
      }
    },
    [activeModelId, profile],
  );

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      return trimmed.length === 0 ? false : request(trimmed, true);
    },
    [request],
  );

  const retry = useCallback(
    async () => (retryPrompt === null ? false : request(retryPrompt, false)),
    [request, retryPrompt],
  );

  const newChat = useCallback(() => {
    if (pendingRef.current) {
      return;
    }
    previousResponseId.current = null;
    setMessages([]);
    setError(null);
    setRetryPrompt(null);
  }, []);

  return {
    messages,
    activeModelId,
    loadingModel,
    pending,
    error,
    canRetry: retryPrompt !== null && !pending,
    send,
    retry,
    newChat,
    reloadModel,
  };
}

function message(
  role: ChatMessage['role'],
  text: string,
  reasoningSummary: string | null = null,
): ChatMessage {
  messageSequence += 1;
  return {
    id: `msg_${Date.now().toString(36)}_${messageSequence.toString(36)}`,
    role,
    text,
    reasoningSummary,
  };
}

function missingCredentialError(): AppError {
  return createAppError({
    category: 'auth',
    message: 'API key tidak tersedia. Hubungkan ulang endpoint dari Setup.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails: {},
  });
}

function localRequestError(): AppError {
  return createAppError({
    category: 'unknown',
    message: 'Request tidak dapat disiapkan. Coba lagi.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: true,
    safeDetails: {},
  });
}
