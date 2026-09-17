import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage, TurnStatus } from '../../domain/conversation';
import type { EndpointProfile } from '../../domain/endpoint';
import { createAppError, type AppError } from '../../domain/error';
import { credentialStore } from '../../services/credentials/store';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { settingsStore } from '../../services/persistence/settings-store';
import {
  responsesClient,
  type ResponseStreamEvent,
  type SendResponseResult,
} from '../../services/transport/responses';

const MAX_OUTPUT_TOKENS = 1024;
const UI_BATCH_MS = 50;
let idSequence = 0;

type RetryState = {
  prompt: string;
  turnId: string;
  assistantItemId: string;
};

export type ChatState = {
  conversationId: string | null;
  messages: ChatMessage[];
  activeModelId: string | null;
  loadingModel: boolean;
  pending: boolean;
  error: AppError | null;
  canRetry: boolean;
  send: (prompt: string) => Promise<boolean>;
  stop: () => void;
  retry: () => Promise<boolean>;
  newChat: () => void;
  reloadModel: () => Promise<void>;
};

export function useChat(
  profile: EndpointProfile | null,
  requestedConversationId: string | null = null,
  startFresh = false,
): ChatState {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(profile !== null);
  const [loadingConversation, setLoadingConversation] = useState(profile !== null && !startFresh);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const previousResponseId = useRef<string | null>(null);
  const previousResponseModelId = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const activeController = useRef<AbortController | null>(null);
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const reloadModel = useCallback(async () => {
    if (profile === null) {
      setActiveModelId(null);
      setLoadingModel(false);
      return;
    }
    try {
      const modelId = await settingsStore.loadActiveModelId();
      if (!alive.current) {
        return;
      }
      setActiveModelId(modelId);
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
      activeController.current?.abort();
      if (streamTimer.current !== null) {
        clearTimeout(streamTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (profile === null || startFresh) {
      return;
    }
    let active = true;
    const load = async () => {
      const saved =
        requestedConversationId === null
          ? await conversationRepository.loadLatest(profile.id)
          : await conversationRepository.loadConversation(requestedConversationId);
      if (active && saved !== null) {
        setConversationId(saved.id);
        setMessages(saved.messages);
      previousResponseId.current = saved.previousResponseId;
      previousResponseModelId.current = saved.previousResponseModelId;
        setRetryState(saved.retry);
      }
      if (active) {
        setLoadingConversation(false);
      }
    };
    void load().catch(() => {
      if (active) {
        setLoadingConversation(false);
      }
    });
    return () => {
      active = false;
    };
  }, [profile, requestedConversationId, startFresh]);

  const request = useCallback(
    async (prompt: string, retry: RetryState | null): Promise<boolean> => {
      if (
        pendingRef.current ||
        loadingConversation ||
        profile === null ||
        activeModelId === null
      ) {
        return false;
      }
      const chainResponseId =
        previousResponseModelId.current === activeModelId ? previousResponseId.current : null;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      const controller = new AbortController();
      activeController.current = controller;
      const turnId = retry?.turnId ?? newId('turn');
      const userItemId = retry === null ? newId('msg') : null;
      const assistantItemId = retry?.assistantItemId ?? newId('msg');
      let streamedText = '';
      let streamedReasoning = '';
      let flushedText = '';
      let flushedReasoning = '';
      let flushChain = Promise.resolve();

      try {
        if (retry === null && userItemId !== null) {
          const started = await conversationRepository.startTurn({
            conversationId,
            turnId,
            userItemId,
            assistantItemId,
            prompt,
            endpointId: profile.id,
            modelId: activeModelId,
            previousResponseId: chainResponseId,
            reasoningSetting: null,
            outputCeiling: MAX_OUTPUT_TOKENS,
          });
          setConversationId(started.conversationId);
          setMessages((current) => [
            ...current,
            message(userItemId, 'user', prompt, null, 'completed'),
            message(assistantItemId, 'assistant', '', null, 'sending'),
          ]);
        } else {
          await conversationRepository.restartTurn(turnId, assistantItemId);
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantItemId
                ? message(assistantItemId, 'assistant', '', null, 'sending')
                : entry,
            ),
          );
        }
      } catch {
        activeController.current = null;
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(localRequestError());
        }
        return false;
      }

      const flush = () => {
        if (!alive.current) {
          return flushChain;
        }
        const text = streamedText;
        const reasoningSummary = streamedReasoning.length === 0 ? null : streamedReasoning;
        if (text === flushedText && streamedReasoning === flushedReasoning) {
          return flushChain;
        }
        flushedText = text;
        flushedReasoning = streamedReasoning;
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantItemId
              ? message(
                  assistantItemId,
                  'assistant',
                  text,
                  reasoningSummary,
                  'streaming',
                )
              : entry,
          ),
        );
        flushChain = flushChain.then(() =>
          conversationRepository.flushAssistant(
            turnId,
            assistantItemId,
            text,
            reasoningSummary,
          ),
        );
        return flushChain;
      };

      const scheduleFlush = () => {
        if (streamTimer.current !== null) {
          return;
        }
        streamTimer.current = setTimeout(() => {
          streamTimer.current = null;
          void flush();
        }, UI_BATCH_MS);
      };

      const onEvent = (event: ResponseStreamEvent) => {
        if (event.type === 'text.delta') {
          streamedText += event.delta;
          scheduleFlush();
        } else if (event.type === 'reasoning.delta') {
          streamedReasoning += event.delta;
          scheduleFlush();
        }
      };

      try {
        const apiKey =
          profile.credentialRef === null
            ? null
            : await credentialStore.read(profile.credentialRef);
        if (apiKey === null) {
          const missing = missingCredentialError();
          await finish(turnId, assistantItemId, 'failed', streamedText, streamedReasoning, null);
          if (alive.current) {
            setError(missing);
            setRetryState({ prompt, turnId, assistantItemId });
          }
          return false;
        }

        const result = await responsesClient.send(
          profile,
          apiKey,
          {
            modelId: activeModelId,
            prompt,
            previousResponseId: chainResponseId,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
          { signal: controller.signal, onEvent },
        );
        streamedText = result.ok ? result.response.text ?? streamedText : result.partial.text ?? streamedText;
        streamedReasoning = result.ok
          ? result.response.reasoningSummary ?? streamedReasoning
          : result.partial.reasoningSummary ?? streamedReasoning;
        if (streamTimer.current !== null) {
          clearTimeout(streamTimer.current);
          streamTimer.current = null;
        }
        if (streamedText.length > 0 || streamedReasoning.length > 0) {
          await flush();
        } else {
          await flushChain;
        }
        const status = resultStatus(result);
        await finish(turnId, assistantItemId, status, streamedText, streamedReasoning, result);
        if (!alive.current) {
          return false;
        }
        if (!result.ok) {
          if (!result.cancelled) {
            setError(result.error);
          }
          setRetryState(
            result.cancelled || result.hadModelEvent
              ? null
              : { prompt, turnId, assistantItemId },
          );
          return false;
        }
        previousResponseId.current = result.response.id;
        previousResponseModelId.current = activeModelId;
        setRetryState(null);
        return true;
      } catch {
        const status: TurnStatus = controller.signal.aborted ? 'cancelled' : 'failed';
        await finish(turnId, assistantItemId, status, streamedText, streamedReasoning, null);
        if (controller.signal.aborted) {
          setRetryState(null);
          return false;
        }
        if (alive.current) {
          setError(localRequestError());
          setRetryState({ prompt, turnId, assistantItemId });
        }
        return false;
      } finally {
        if (streamTimer.current !== null) {
          clearTimeout(streamTimer.current);
          streamTimer.current = null;
        }
        if (activeController.current === controller) {
          activeController.current = null;
        }
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
        }
      }

      async function finish(
        currentTurnId: string,
        currentAssistantItemId: string,
        status: Exclude<TurnStatus, 'sending' | 'streaming'>,
        text: string,
        reasoning: string,
        result: SendResponseResult | null,
      ): Promise<void> {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === currentAssistantItemId
              ? message(
                  currentAssistantItemId,
                  'assistant',
                  text,
                  reasoning.length === 0 ? null : reasoning,
                  status,
                )
              : entry,
          ),
        );
        await conversationRepository.finishTurn({
          turnId: currentTurnId,
          assistantItemId: currentAssistantItemId,
          status,
          text,
          reasoningSummary: reasoning.length === 0 ? null : reasoning,
          responseId: result?.ok ? result.response.id : result?.partial.id ?? null,
          usage: result?.ok ? result.response.usage : null,
          timing: result?.timing ?? null,
        });
      }
    },
    [activeModelId, conversationId, loadingConversation, profile],
  );

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      return trimmed.length === 0 ? false : request(trimmed, null);
    },
    [request],
  );

  const retry = useCallback(
    async () => (retryState === null ? false : request(retryState.prompt, retryState)),
    [request, retryState],
  );

  const stop = useCallback(() => activeController.current?.abort(), []);

  const newChat = useCallback(() => {
    if (pendingRef.current) {
      return;
    }
    setConversationId(null);
    previousResponseId.current = null;
    previousResponseModelId.current = null;
    setMessages([]);
    setError(null);
    setRetryState(null);
  }, []);

  return {
    conversationId,
    messages,
    activeModelId,
    loadingModel: loadingModel || loadingConversation,
    pending,
    error,
    canRetry: retryState !== null && !pending,
    send,
    stop,
    retry,
    newChat,
    reloadModel,
  };
}

function resultStatus(result: SendResponseResult): Exclude<TurnStatus, 'sending' | 'streaming'> {
  if (result.ok) {
    return 'completed';
  }
  return result.cancelled ? 'cancelled' : 'failed';
}

function message(
  id: string,
  role: ChatMessage['role'],
  text: string,
  reasoningSummary: string | null,
  status: TurnStatus,
): ChatMessage {
  return { id, role, text, reasoningSummary, status };
}

function newId(prefix: string): string {
  idSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSequence.toString(36)}`;
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
