import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ChatMessage,
  ConversationInputMessage,
  TurnStatus,
} from '../../domain/conversation';
import {
  buildContextBudget,
  DEFAULT_CONTEXT_POLICY,
  type ContextBudgetResult,
  type ContextPolicy,
} from '../../domain/context';
import type { EndpointProfile } from '../../domain/endpoint';
import { createAppError, type AppError } from '../../domain/error';
import type { ModelRequestSnapshot } from '../../domain/model-config';
import { IMAGE_ATTACHMENT_ERROR_COPY, type ImageAttachment } from '../../domain/attachment';
import {
  deleteStagedImages,
  deleteUnreferencedStagedImages,
  stageImageAttachment,
} from '../../services/attachments/images';
import { buildSystemPrompt } from '../../domain/system-prompt';
import { DEFAULT_TOOL_POLICY, type ToolActivity } from '../../domain/tool';
import type { TurnMetrics } from '../../domain/usage';
import { credentialStore } from '../../services/credentials/store';
import { fileCatalogStorage, readBundledDefaults } from '../../services/persistence/catalog-files';
import {
  loadModelRequestSnapshot,
  saveModelReasoningEffort,
} from '../../services/persistence/catalog-store';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { settingsStore } from '../../services/persistence/settings-store';
import { runLocalCompaction } from '../../services/context/local-compaction';
import {
  protocolClient,
  type ResponseStreamEvent,
  type SendResponseResult,
} from '../../services/transport/protocol';
import { createToolRegistry } from '../../services/tools/registry';
import { type WebSearchConfig } from '../../services/tools/gateway';
import { webToolsCredentialId, webToolsStore } from '../../services/persistence/web-tools-store';
import { runAgentLoop, type ToolCallPersistence } from './agent-loop';

const UI_BATCH_MS = 50;
const CONTEXT_DEBOUNCE_MS = 150;
let idSequence = 0;

type RetryState = {
  prompt: string;
  turnId: string;
  assistantItemId: string;
};

export type ChatState = {
  conversationId: string | null;
  messages: ChatMessage[];
  metrics: TurnMetrics[];
  contextBudget: ContextBudgetResult | null;
  contextPolicy: ContextPolicy;
  autoCompact: boolean;
  autoApproveTools: boolean;
  compacting: boolean;
  compactionActive: boolean;
  activeModelId: string | null;
  reasoningEffort: string | null;
  reasoningOptions: string[];
  attachments: ImageAttachment[];
  canAttachImages: boolean;
  loadingModel: boolean;
  pending: boolean;
  toolActivities: Record<string, ToolActivity[]>;
  error: AppError | null;
  canRetry: boolean;
  send: (prompt: string, attachments?: ImageAttachment[]) => Promise<boolean>;
  addImage: () => Promise<void>;
  removeImage: (id: string) => void;
  stop: () => void;
  resolveToolApproval: (approved: boolean) => void;
  retry: () => Promise<boolean>;
  newChat: () => void;
  reloadModel: () => Promise<void>;
  updateContext: (draft: string) => void;
  compactNow: () => Promise<boolean>;
  setAutoCompact: (enabled: boolean) => Promise<boolean>;
  setAutoApproveTools: (enabled: boolean) => void;
  setReasoningEffort: (effort: string) => Promise<boolean>;
};

export function useChat(
  profile: EndpointProfile | null,
  requestedConversationId: string | null = null,
  startFresh = false,
): ChatState {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<TurnMetrics[]>([]);
  const [contextBudget, setContextBudget] = useState<ContextBudgetResult | null>(null);
  const [contextPolicy, setContextPolicy] = useState<ContextPolicy>(DEFAULT_CONTEXT_POLICY);
  const [autoCompact, setAutoCompactState] = useState(true);
  const [autoApproveTools, setAutoApproveToolsState] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [compactionActive, setCompactionActive] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelRequestSnapshot | null>(null);
  const [reasoningEffort, setReasoningEffortState] = useState<string | null>(null);
  const [reasoningOptions, setReasoningOptions] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [loadingModel, setLoadingModel] = useState(profile !== null);
  const [loadingConversation, setLoadingConversation] = useState(profile !== null && !startFresh);
  const [pending, setPending] = useState(false);
  const [toolActivities, setToolActivities] = useState<Record<string, ToolActivity[]>>({});
  const [error, setError] = useState<AppError | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const previousResponseId = useRef<string | null>(null);
  const previousResponseModelId = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const reasoningSavingRef = useRef(false);
  const activeController = useRef<AbortController | null>(null);
  const approvalResolver = useRef<((approved: boolean) => void) | null>(null);
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRequestId = useRef(0);
  const compactingRef = useRef(false);
  const alive = useRef(true);

  const updateToolProgress = useCallback((assistantItemId: string, activity: ToolActivity) => {
    setToolActivities((current) => {
      const calls = current[assistantItemId] ?? [];
      const index = calls.findIndex((entry) => entry.callId === activity.callId);
      return {
        ...current,
        [assistantItemId]: index === -1
          ? [...calls, activity]
          : calls.map((entry, entryIndex) => (entryIndex === index ? activity : entry)),
      };
    });
  }, []);

  const requestToolApproval = useCallback(
    (_activity: ToolActivity, signal: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        const finish = (approved: boolean) => {
          signal.removeEventListener('abort', reject);
          if (approvalResolver.current === finish) {
            approvalResolver.current = null;
          }
          resolve(approved);
        };
        const reject = () => finish(false);
        approvalResolver.current = finish;
        if (signal.aborted) {
          reject();
          return;
        }
        signal.addEventListener('abort', reject, { once: true });
      }),
    [],
  );

  const resolveToolApproval = useCallback((approved: boolean) => {
    approvalResolver.current?.(approved);
  }, []);

  const reloadModel = useCallback(async () => {
    setModelConfig(null);
    setContextBudget(null);
    setContextPolicy(DEFAULT_CONTEXT_POLICY);
    if (profile === null) {
      setActiveModelId(null);
      setReasoningEffortState(null);
      setReasoningOptions([]);
      setAutoCompactState(true);
      setLoadingModel(false);
      return;
    }
    try {
      const modelId = await settingsStore.loadActiveModelId();
      if (!alive.current) {
        return;
      }
      setActiveModelId(modelId);
      if (modelId === null) {
        setModelConfig(null);
        setContextPolicy(DEFAULT_CONTEXT_POLICY);
        setReasoningEffortState(null);
        setReasoningOptions([]);
      } else {
        try {
          const config = await loadModelRequestSnapshot(
            fileCatalogStorage,
            readBundledDefaults,
            profile,
            modelId,
          );
          if (alive.current) {
            setModelConfig(config);
            setContextPolicy(config?.contextPolicy ?? DEFAULT_CONTEXT_POLICY);
            setReasoningEffortState(config?.reasoningEffort ?? null);
            setReasoningOptions(config?.reasoningOptions ?? []);
          }
        } catch {
          if (alive.current) {
            setModelConfig(null);
            setContextPolicy(DEFAULT_CONTEXT_POLICY);
            setReasoningEffortState(null);
            setReasoningOptions([]);
            setError(modelConfigError('Thinking configuration is invalid. Check model details.'));
          }
        }
      }
    } catch {
      if (alive.current) {
        setActiveModelId(null);
        setModelConfig(null);
        setContextPolicy(DEFAULT_CONTEXT_POLICY);
        setReasoningEffortState(null);
        setReasoningOptions([]);
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
      if (contextTimer.current !== null) {
        clearTimeout(contextTimer.current);
      }
      contextRequestId.current += 1;
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
      if (active) {
        if (saved === null) {
          setConversationId(null);
          setMessages([]);
          setMetrics([]);
          previousResponseId.current = null;
          previousResponseModelId.current = null;
          setRetryState(null);
          setAutoCompactState(true);
          setCompactionActive(false);
          setToolActivities({});
        } else {
          setConversationId(saved.id);
          setMessages(saved.messages);
          setMetrics(saved.metrics);
          previousResponseId.current = saved.previousResponseId;
          previousResponseModelId.current = saved.previousResponseModelId;
          setRetryState(saved.retry);
          setAutoCompactState(saved.autoCompact ?? true);
          setCompactionActive(saved.compactionActive ?? false);
          setToolActivities(saved.toolActivities ?? {});
        }
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

  useEffect(() => {
    if (profile === null) return;
    let active = true;
    void conversationRepository.loadImageAttachments().then((referenced) => {
      if (active) deleteUnreferencedStagedImages(referenced);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profile]);

  const request = useCallback(
    async (prompt: string, retry: RetryState | null, inputAttachments: ImageAttachment[] = []): Promise<boolean> => {
      if (
        pendingRef.current ||
        compactingRef.current ||
        loadingConversation ||
        profile === null ||
        activeModelId === null
      ) {
        return false;
      }
      pendingRef.current = true;
      setPending(true);
      setError(null);
      let requestConfig: ModelRequestSnapshot | null;
      try {
        requestConfig = await loadModelRequestSnapshot(
          fileCatalogStorage,
          readBundledDefaults,
          profile,
          activeModelId,
        );
      } catch {
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(modelConfigError('Model configuration is invalid. Check model details.'));
        }
        return false;
      }
      if (requestConfig === null) {
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(modelConfigError('Active model is missing from the catalog. Refresh or select it again.'));
        }
        return false;
      }
      if (inputAttachments.length > 0 && !supportsImageAttachments(profile, requestConfig)) {
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(modelConfigError('Image attachments are not supported by this model and protocol.'));
        }
        return false;
      }
      setModelConfig(requestConfig);
      setContextPolicy(requestConfig.contextPolicy ?? DEFAULT_CONTEXT_POLICY);
      if (!alive.current) {
        pendingRef.current = false;
        return false;
      }
      const apiKey =
        profile.credentialRef === null
          ? null
          : await credentialStore.read(profile.credentialRef);
      if (apiKey === null) {
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(missingCredentialError());
        }
        return false;
      }

      const modelPolicy = requestConfig.contextPolicy ?? DEFAULT_CONTEXT_POLICY;
      const requestPolicy = {
        ...modelPolicy,
        autoCompact: modelPolicy.autoCompact && autoCompact,
      };
      let preflightHistory: ConversationInputMessage[] = [];
      try {
        if (conversationId !== null) {
          preflightHistory = await conversationRepository.loadRequestHistory(conversationId);
        }
        let budget = contextBudgetFor(
          requestConfig,
          preflightHistory,
          prompt,
          metrics.at(-1)?.usage.inputTokens ?? null,
          inputAttachments,
        );
        let compactRounds = 0;
        while (
          conversationId !== null &&
          requestPolicy.autoCompact &&
          budget.usedPercent !== null &&
          (budget.usedPercent >= requestPolicy.triggerPercent ||
            (compactRounds > 0 && budget.usedPercent >= requestPolicy.targetPercent)) &&
          compactRounds < 8
        ) {
          compactingRef.current = true;
          setCompacting(true);
          const compacted = await runLocalCompaction({
            profile,
            apiKey,
            conversationId,
            modelId: requestConfig.modelId,
            contextWindow: requestConfig.contextWindow,
            effectiveMaxOutput: requestConfig.effectiveMaxOutput,
            reasoningEffort: requestConfig.reasoningEffort,
            minimumRecentTurns: requestPolicy.minimumRecentTurns,
            beforeEstimate: budget.prospectiveUsed ?? budget.inputTokensEstimate,
          });
          compactingRef.current = false;
          setCompacting(false);
          if (!compacted.ok) {
            break;
          }
          setCompactionActive(true);
          compactRounds += 1;
          preflightHistory = await conversationRepository.loadRequestHistory(conversationId);
          const nextBudget = contextBudgetFor(
            requestConfig,
            preflightHistory,
            prompt,
            metrics.at(-1)?.usage.inputTokens ?? null,
            inputAttachments,
          );
          if ((nextBudget.prospectiveUsed ?? nextBudget.inputTokensEstimate) >= (budget.prospectiveUsed ?? budget.inputTokensEstimate)) {
            budget = nextBudget;
            break;
          }
          budget = nextBudget;
        }
        setContextBudget(budget);
        if (
          budget.usedPercent !== null &&
          budget.usedPercent >= requestPolicy.hardStopPercent
        ) {
          pendingRef.current = false;
          if (alive.current) {
            setPending(false);
            setError(contextHardStopError());
          }
          return false;
        }
      } catch {
        compactingRef.current = false;
        setCompacting(false);
        pendingRef.current = false;
        if (alive.current) {
          setPending(false);
          setError(localRequestError());
        }
        return false;
      }
      const chainResponseId =
        previousResponseModelId.current === activeModelId ? previousResponseId.current : null;
      const controller = new AbortController();
      activeController.current = controller;
      const turnId = retry?.turnId ?? newId('turn');
      const userItemId = retry === null ? newId('msg') : null;
      const assistantItemId = retry?.assistantItemId ?? newId('msg');
      setToolActivities((current) => ({ ...current, [assistantItemId]: [] }));
      let currentConversationId = conversationId;
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
            attachments: inputAttachments,
            endpointId: profile.id,
            modelId: activeModelId,
            previousResponseId: chainResponseId,
            reasoningSetting: requestConfig.reasoningEffort,
            outputCeiling: requestConfig.outputLimit,
            autoCompact,
          });
          currentConversationId = started.conversationId;
          setConversationId(started.conversationId);
          setMessages((current) => [
            ...current,
            message(userItemId, 'user', prompt, null, 'completed', inputAttachments),
            message(assistantItemId, 'assistant', '', null, 'sending'),
          ]);
          setAttachments([]);
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
        let requestHistory: ConversationInputMessage[] = [];
        if (currentConversationId !== null) {
          requestHistory = await conversationRepository.loadRequestHistory(currentConversationId);
        }
        if (requestHistory.length === 0) {
          requestHistory = [{ role: 'user', content: prompt, attachments: inputAttachments }];
        }
        const persistence: ToolCallPersistence | undefined =
          typeof conversationRepository.recordToolCall === 'function' &&
          typeof conversationRepository.updateToolCall === 'function'
            ? conversationRepository
            : undefined;
        const webTools = await webToolsStore.load();
        const webSearchToken = webTools.enabled
          ? await credentialStore.read(webToolsCredentialId(webTools.provider))
          : null;
        let webSearchConfig: WebSearchConfig | null = null;
        if (webTools.enabled && webSearchToken !== null && webSearchToken.trim().length > 0) {
          webSearchConfig = webTools.provider === 'exa'
            ? { provider: 'exa', token: webSearchToken.trim() }
            : webTools.baseUrl === null
              ? null
              : { provider: 'gateway', baseUrl: webTools.baseUrl, token: webSearchToken.trim(), engines: webTools.engines };
        }
        const registry = createToolRegistry(webSearchConfig);
        const result = await runAgentLoop({
          profile,
          apiKey,
          turnId,
          request: {
            modelId: activeModelId,
            prompt,
            history: requestHistory,
            previousResponseId: null,
            promptCacheKey: currentConversationId,
            maxOutputTokens: requestConfig.outputLimit,
            reasoningEffort: requestConfig.reasoningEffort,
          },
          transport: protocolClient,
          registry,
          definitions: registry.definitions(),
          policy: autoApproveTools ? { approval: 'never' } : DEFAULT_TOOL_POLICY,
          persistence,
          signal: controller.signal,
          onEvent,
          onProgress: (activity) => updateToolProgress(assistantItemId, activity),
          requestApproval: requestToolApproval,
        });
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
        try {
          await finish(turnId, assistantItemId, status, streamedText, streamedReasoning, result);
        } catch {
          if (alive.current) {
            setError(result.ok ? responseSaveError() : result.error);
            setRetryState(
              result.ok || result.cancelled || result.hadModelEvent
                ? null
                : { prompt, turnId, assistantItemId },
            );
          }
          return result.ok;
        }
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
        if (currentConversationId !== null) {
          const nextMetrics = await conversationRepository.loadTurnMetrics(currentConversationId);
          if (alive.current) {
            setMetrics(nextMetrics);
          }
        }
      }
    },
    [
      activeModelId,
      autoCompact,
      autoApproveTools,
      conversationId,
      loadingConversation,
      metrics,
      profile,
      requestToolApproval,
      updateToolProgress,
    ],
  );

  const updateContext = useCallback(
    (draft: string) => {
      if (contextTimer.current !== null) {
        clearTimeout(contextTimer.current);
        contextTimer.current = null;
      }
      const requestId = ++contextRequestId.current;
      if (
        profile === null ||
        activeModelId === null ||
        modelConfig === null ||
        modelConfig.modelId !== activeModelId
      ) {
        setContextBudget(null);
        return;
      }
      contextTimer.current = setTimeout(() => {
        contextTimer.current = null;
        void (async () => {
          try {
            const history =
              conversationId === null
                ? []
                : await conversationRepository.loadRequestHistory(conversationId);
            const prompt = draft.trim();
            const next = contextBudgetFor(
              modelConfig,
              history,
              prompt,
              metrics.at(-1)?.usage.inputTokens ?? null,
              attachments,
            );
            if (alive.current && requestId === contextRequestId.current) {
              setContextBudget(next);
            }
          } catch {
            if (alive.current && requestId === contextRequestId.current) {
              setContextBudget(null);
            }
          }
        })();
      }, CONTEXT_DEBOUNCE_MS);
    },
    [activeModelId, attachments, conversationId, metrics, modelConfig, profile],
  );

  const compactNow = useCallback(async (): Promise<boolean> => {
    if (
      pendingRef.current ||
      compactingRef.current ||
      profile === null ||
      activeModelId === null ||
      conversationId === null
    ) {
      return false;
    }
    compactingRef.current = true;
    setCompacting(true);
    setError(null);
    try {
      const config = await loadModelRequestSnapshot(
        fileCatalogStorage,
        readBundledDefaults,
        profile,
        activeModelId,
      );
      if (config === null) {
        if (alive.current) {
          setError(modelConfigError('Active model is missing from the catalog.'));
        }
        return false;
      }
      const apiKey = profile.credentialRef === null ? null : await credentialStore.read(profile.credentialRef);
      if (apiKey === null) {
        setError(missingCredentialError());
        return false;
      }
      const policy = config.contextPolicy ?? DEFAULT_CONTEXT_POLICY;
      setModelConfig(config);
      setContextPolicy(policy);
      const result = await runLocalCompaction({
        profile,
        apiKey,
        conversationId,
        modelId: config.modelId,
        contextWindow: config.contextWindow,
        effectiveMaxOutput: config.effectiveMaxOutput,
        reasoningEffort: config.reasoningEffort,
        minimumRecentTurns: policy.minimumRecentTurns,
        beforeEstimate: contextBudget?.prospectiveUsed ?? contextBudget?.inputTokensEstimate ?? 0,
      });
      if (!result.ok) {
        if (alive.current) {
          setError(modelConfigError(result.message));
        }
        return false;
      }
      setCompactionActive(true);
      setError(null);
      updateContext('');
      return true;
    } catch {
      if (alive.current) {
        setError(localRequestError());
      }
      return false;
    } finally {
      compactingRef.current = false;
      if (alive.current) {
        setCompacting(false);
      }
    }
  }, [activeModelId, contextBudget, conversationId, profile, updateContext]);

  const setAutoCompact = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (pendingRef.current || compactingRef.current) {
        return false;
      }
      try {
        if (conversationId !== null) {
          await conversationRepository.setAutoCompact(conversationId, enabled);
        }
        if (alive.current) {
          setAutoCompactState(enabled);
        }
        return true;
      } catch {
        if (alive.current) {
          setError(localRequestError());
        }
        return false;
      }
    },
    [conversationId],
  );

  const send = useCallback(
    async (prompt: string, inputAttachments: ImageAttachment[] = []) => {
      const trimmed = prompt.trim();
      if (trimmed.length === 0 && inputAttachments.length === 0) return false;
      const sent = await request(trimmed, null, inputAttachments);
      if (sent) setAttachments([]);
      return sent;
    },
    [request],
  );

  const retry = useCallback(
    async () => (retryState === null ? false : request(retryState.prompt, retryState)),
    [request, retryState],
  );

  const stop = useCallback(() => activeController.current?.abort(), []);

  const setReasoningEffort = useCallback(
    async (effort: string): Promise<boolean> => {
      if (
        pendingRef.current ||
        profile === null ||
        activeModelId === null ||
        reasoningSavingRef.current ||
        !reasoningOptions.includes(effort)
      ) {
        return false;
      }
      reasoningSavingRef.current = true;
      try {
        await saveModelReasoningEffort(fileCatalogStorage, profile.id, activeModelId, effort);
        if (alive.current) {
          setReasoningEffortState(effort);
          setError(null);
        }
        return true;
      } catch {
        if (alive.current) {
          setError(modelConfigError('Thinking selection could not be saved.'));
        }
        return false;
      } finally {
        reasoningSavingRef.current = false;
      }
    },
    [activeModelId, profile, reasoningOptions],
  );

  const newChat = useCallback(() => {
    if (pendingRef.current || compactingRef.current) {
      return;
    }
    setConversationId(null);
    setMetrics([]);
    previousResponseId.current = null;
    previousResponseModelId.current = null;
    setMessages([]);
    setContextBudget(null);
    setError(null);
    setRetryState(null);
    setAutoCompactState(true);
    setCompactionActive(false);
    setToolActivities({});
    setAttachments((current) => {
      deleteStagedImages(current);
      return [];
    });
  }, []);

  const canAttachImages = supportsImageAttachments(profile, modelConfig);

  return {
    conversationId,
    messages,
    metrics,
    contextBudget,
    contextPolicy,
    autoCompact,
    autoApproveTools,
    compacting,
    compactionActive,
    activeModelId,
    reasoningEffort,
    reasoningOptions,
    attachments,
    canAttachImages,
    loadingModel: loadingModel || loadingConversation,
    pending,
    toolActivities,
    error,
    canRetry: retryState !== null && !pending,
    send,
    addImage: async () => {
      if (!canAttachImages) {
        setError(modelConfigError('Image attachments are not supported by this model and protocol.'));
        return;
      }
      const result = await stageImageAttachment(attachments);
      if (result.kind === 'ready') {
        setAttachments((current) => [...current, result.attachment]);
      } else if (result.kind === 'rejected') {
        setError(modelConfigError(IMAGE_ATTACHMENT_ERROR_COPY[result.reason]));
      }
    },
    removeImage: (id) => {
      setAttachments((current) => {
        const removed = current.find((attachment) => attachment.id === id);
        if (removed !== undefined) deleteStagedImages([removed]);
        return current.filter((attachment) => attachment.id !== id);
      });
    },
    stop,
    resolveToolApproval,
    retry,
    newChat,
    reloadModel,
    updateContext,
    compactNow,
    setAutoCompact,
    setAutoApproveTools: (enabled) => setAutoApproveToolsState(enabled),
    setReasoningEffort,
  };
}

function contextBudgetFor(
  config: ModelRequestSnapshot,
  history: ConversationInputMessage[],
  prompt: string,
  providerInputTokens: number | null,
  attachments: ImageAttachment[] = [],
): ContextBudgetResult {
  const input = prompt.length === 0 && attachments.length === 0
    ? history
    : [...history, { role: 'user' as const, content: prompt, attachments }];
  return buildContextBudget({
    contextWindow: config.contextWindow,
    instructions: buildSystemPrompt(config.modelId),
    input,
    outputLimit: config.outputLimit,
    effectiveMaxOutput: config.effectiveMaxOutput,
    providerInputTokens,
  });
}

function supportsImageAttachments(
  profile: EndpointProfile | null,
  config: ModelRequestSnapshot | null,
): boolean {
  return profile?.protocol === 'responses' && config?.inputModalities?.includes('image') === true;
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
  attachments: ImageAttachment[] = [],
): ChatMessage {
  return { id, role, text, reasoningSummary, status, attachments };
}

function newId(prefix: string): string {
  idSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSequence.toString(36)}`;
}

function missingCredentialError(): AppError {
  return createAppError({
    category: 'auth',
    message: 'API key is unavailable. Reconnect the endpoint from Setup.',
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
    message: 'Request could not be prepared. Try again.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: true,
    safeDetails: {},
  });
}

function responseSaveError(): AppError {
  return createAppError({
    category: 'unknown',
    message: 'Response completed, but local history could not be updated. Copy it before leaving this chat.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails: { stage: 'persistence' },
  });
}

function contextHardStopError(): AppError {
  return createAppError({
    category: 'request',
    message: 'Context is nearly full. Choose Compact now, start a new chat, or reduce the output reserve.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails: {},
  });
}

function modelConfigError(message: string): AppError {
  return createAppError({
    category: 'request',
    message,
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails: {},
  });
}
