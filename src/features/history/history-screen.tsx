import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type ListRenderItemInfo,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConversationCursor, ConversationSummary, TurnStatus } from '../../domain/conversation';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { pickConversation, shareConversation } from '../../services/persistence/catalog-transfer';
import { deleteStagedImages } from '../../services/attachments/images';

const PAGE_SIZE = 20;

const colors = {
  background: '#0b1326',
  surfaceLowest: '#060e20',
  surfaceLow: '#131b2e',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  border: '#334155',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  primary: '#10b981',
  primaryText: '#020617',
  secondary: '#06b6d4',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

const fonts = {
  heading: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

type HistoryStatus = {
  label: string;
  color: string;
  detail: string;
};

export function historyStatus(status: TurnStatus | null): HistoryStatus {
  if (status === 'sending' || status === 'streaming') {
    return { label: 'LIVE', color: colors.primary, detail: 'Inference active' };
  }
  if (status === 'interrupted') {
    return { label: 'INTERRUPTED', color: colors.warning, detail: 'Interrupted when the app closed' };
  }
  if (status === 'failed' || status === 'cancelled') {
    return { label: status.toUpperCase(), color: colors.error, detail: 'Request did not complete' };
  }
  return { label: 'COMPLETED', color: colors.muted, detail: 'Completed locally' };
}

export default function HistoryScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<ConversationCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [interruptedOnly, setInterruptedOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [transferring, setTransferring] = useState(false);
  const router = useRouter();

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await conversationRepository.list(PAGE_SIZE);
      setConversations(page.conversations);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFirst();
    }, [loadFirst]),
  );

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await conversationRepository.list(PAGE_SIZE, cursor);
      setConversations((current) => [...current, ...page.conversations]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const saveTitle = useCallback(async (id: string) => {
    const next = title.trim();
    if (next.length === 0) {
      return;
    }
    await conversationRepository.rename(id, next);
    setEditingId(null);
    await loadFirst();
  }, [loadFirst, title]);

  const startEditing = useCallback((conversation: ConversationSummary) => {
    setEditingId(conversation.id);
    setTitle(conversation.title);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setTitle('');
  }, []);

  const openConversation = useCallback((id: string) => {
    router.push({ pathname: '/chat/[conversationId]', params: { conversationId: id } });
  }, [router]);

  const startNewChat = useCallback(() => {
    router.push({ pathname: '/chat/[conversationId]', params: { conversationId: 'new' } });
  }, [router]);

  const deleteConversation = useCallback(async () => {
    if (deleteTarget === null) {
      return;
    }
    await conversationRepository.remove(deleteTarget.id, deleteStagedImages);
    setDeleteTarget(null);
    await loadFirst();
  }, [deleteTarget, loadFirst]);

  const exportConversation = useCallback(async (conversation: ConversationSummary) => {
    setTransferring(true);
    try {
      const value = await conversationRepository.exportConversation(conversation.id);
      if (value === null) throw new Error('Conversation was not found.');
      await shareConversation(value);
    } catch {
      Alert.alert('Could not export conversation', 'The conversation or share sheet is unavailable.');
    } finally {
      setTransferring(false);
    }
  }, []);

  const importConversation = useCallback(async () => {
    setTransferring(true);
    try {
      const value = await pickConversation();
      if (value === null) return;
      const id = await conversationRepository.importConversation(value);
      await loadFirst();
      router.push({ pathname: '/chat/[conversationId]', params: { conversationId: id } });
    } catch {
      Alert.alert('Could not import conversation', 'The selected file is invalid or uses an unsupported schema.');
    } finally {
      setTransferring(false);
    }
  }, [loadFirst, router]);

  const visibleConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (interruptedOnly && conversation.status !== 'interrupted') {
        return false;
      }
      if (normalizedQuery.length === 0) {
        return true;
      }
      return [conversation.title, conversation.activeModelId, historyStatus(conversation.status).label]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [conversations, interruptedOnly, query]);

  const renderConversation = useCallback(
    ({ item }: ListRenderItemInfo<ConversationSummary>) => (
      <HistoryRow
        conversation={item}
        editing={editingId === item.id}
        title={title}
        onTitleChange={setTitle}
        onOpen={openConversation}
        onStartEditing={startEditing}
        onCancelEditing={cancelEditing}
        onSave={saveTitle}
        onDelete={setDeleteTarget}
        onExport={exportConversation}
        transferring={transferring}
      />
    ),
    [cancelEditing, editingId, exportConversation, openConversation, saveTitle, startEditing, title, transferring],
  );

  const filtered = query.trim().length > 0 || interruptedOnly;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={20} tintColor={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.4 }}>
            MyLLM
          </Text>
        </View>
      </View>

      <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 }}>
                Conversation History
              </Text>
            </View>
            <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              Local runtime history and cached chat sessions
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import conversation"
            accessibilityState={{ busy: transferring, disabled: transferring }}
            disabled={transferring}
            onPress={() => void importConversation()}
            style={({ pressed }) => ({
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: colors.surfaceHigh,
              opacity: transferring ? 0.5 : pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>IMPORT</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={startNewChat}
            hitSlop={4}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            })}>
            <SymbolView name={{ ios: 'plus', android: 'add' }} size={16} tintColor={colors.primaryText} />
            <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: 13 }}>New Chat</Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 12,
            borderRadius: 8,
            backgroundColor: colors.surfaceLow,
          }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SymbolView name={{ ios: 'cylinder.fill', android: 'database' }} size={18} tintColor={colors.primary} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.4 }}>
                {String(conversations.length)} LOADED SESSIONS
              </Text>
              <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
                Local SQLite history on this device
              </Text>
            </View>
          </View>
          <Text
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: colors.surfaceHigh,
              color: colors.primary,
              fontFamily: fonts.monoMedium,
              fontSize: 10,
            }}>
            LOCAL
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              borderRadius: 4,
              backgroundColor: colors.surfaceHigh,
            }}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={colors.outline} />
            <TextInput
              accessibilityLabel="Filter conversations"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Filter title, model, or status..."
              placeholderTextColor={colors.outline}
              style={{ flex: 1, minHeight: 40, paddingHorizontal: 8, color: colors.text, fontFamily: fonts.mono, fontSize: 11 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show interrupted conversations only"
            accessibilityHint="Toggle the interrupted conversation filter"
            accessibilityState={{ selected: interruptedOnly }}
            onPress={() => setInterruptedOnly((value) => !value)}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              backgroundColor: interruptedOnly ? colors.primary : colors.surfaceHigh,
              opacity: pressed ? 0.8 : 1,
            })}>
            <SymbolView
              name={{ ios: 'line.3.horizontal.decrease.circle', android: 'filter_list' }}
              size={18}
              tintColor={interruptedOnly ? colors.primaryText : colors.muted}
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>Loading local history.</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          contentContainerStyle={{ flexGrow: 1, gap: 8, paddingHorizontal: 16 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyHistory filtered={filtered} onPress={filtered ? () => { setQuery(''); setInterruptedOnly(false); } : startNewChat} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
          renderItem={renderConversation}
        />
      )}

      <DeleteSheet
        conversation={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteConversation()}
      />
    </SafeAreaView>
  );
}

const HistoryRow = memo(function HistoryRow({
  conversation,
  editing,
  title,
  onTitleChange,
  onOpen,
  onStartEditing,
  onCancelEditing,
  onSave,
  onDelete,
  onExport,
  transferring,
}: {
  conversation: ConversationSummary;
  editing: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  onOpen: (id: string) => void;
  onStartEditing: (conversation: ConversationSummary) => void;
  onCancelEditing: () => void;
  onSave: (id: string) => Promise<void>;
  onDelete: (conversation: ConversationSummary) => void;
  onExport: (conversation: ConversationSummary) => Promise<void>;
  transferring: boolean;
}) {
  const status = historyStatus(conversation.status);

  if (editing) {
    return (
      <View style={{ gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusBadge status={{ label: 'EDITING METADATA', color: colors.secondary, detail: '' }} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
              {conversation.activeModelId}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
            PRESS RETURN TO SAVE
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 10,
            borderRadius: 4,
            backgroundColor: colors.surfaceHigh,
          }}>
          <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={18} tintColor={colors.primary} />
          <TextInput
            accessibilityLabel="Conversation title"
            autoFocus
            value={title}
            onChangeText={onTitleChange}
            onSubmitEditing={() => void onSave(conversation.id)}
            returnKeyType="done"
            style={{ flex: 1, minHeight: 40, color: colors.text, fontFamily: fonts.mono, fontSize: 13 }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <SmallButton label="Cancel" onPress={onCancelEditing} />
          <SmallButton label="Save Changes" tone="primary" onPress={() => void onSave(conversation.id)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLow }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Open ' + conversation.title}
        accessibilityHint="Open this conversation in chat"
        onPress={() => onOpen(conversation.id)}
        style={({ pressed }) => ({ gap: 8, padding: 12, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <StatusBadge status={status} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
            {conversation.activeModelId}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 }}>
          {conversation.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
          {new Date(conversation.updatedAt).toLocaleString()}
        </Text>
      </Pressable>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.surfaceLowest,
        }}>
        <Text numberOfLines={1} style={{ flex: 1, color: status.color, fontFamily: fonts.mono, fontSize: 10 }}>
          {status.detail}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <IconButton label={'Export ' + conversation.title} icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }} disabled={transferring} onPress={() => void onExport(conversation)} />
          <IconButton label={'Rename ' + conversation.title} icon={{ ios: 'pencil', android: 'edit' }} onPress={() => onStartEditing(conversation)} />
          <IconButton label={'Delete ' + conversation.title} icon={{ ios: 'trash', android: 'delete' }} danger onPress={() => onDelete(conversation)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Open ' + conversation.title}
            onPress={() => onOpen(conversation.id)}
            hitSlop={4}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              paddingHorizontal: 8,
              borderRadius: 4,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: colors.primaryText, fontFamily: fonts.monoMedium, fontSize: 10 }}>Open</Text>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} tintColor={colors.primaryText} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

function StatusBadge({ status }: { status: HistoryStatus }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.color }} />
      <Text style={{ color: status.color, fontFamily: fonts.monoMedium, fontSize: 10 }}>{status.label}</Text>
    </View>
  );
}

function IconButton({
  label,
  icon,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: { ios: 'pencil' | 'trash' | 'square.and.arrow.up'; android: 'edit' | 'delete' | 'ios_share' };
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <SymbolView name={icon} size={16} tintColor={danger ? colors.error : colors.muted} />
    </Pressable>
  );
}

function SmallButton({ label, tone = 'secondary', onPress }: { label: string; tone?: 'secondary' | 'primary'; onPress: () => void }) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 36,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: primary ? colors.primary : colors.surfaceHigh,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: primary ? colors.primaryText : colors.text, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text>
    </Pressable>
  );
}

function EmptyHistory({ filtered, onPress }: { filtered: boolean; onPress: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 48 }}>
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.surfaceLow }}>
        <SymbolView name={{ ios: 'folder.fill', android: 'folder_off' }} size={32} tintColor={colors.primary} />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 }}>
        {filtered ? 'No matching conversations' : 'Local Ledger Empty'}
      </Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
        {filtered
          ? 'Try a different query or clear the interrupted filter.'
          : 'No conversation transcripts found in the local SQLite repository. Start a fresh thread with an active model.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filtered ? 'Clear conversation filters' : 'Start a new chat'}
        onPress={onPress}
        hitSlop={4}
        style={({ pressed }) => ({
          minHeight: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 8,
          paddingHorizontal: 16,
          borderRadius: 8,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.8 : 1,
        })}>
        <SymbolView name={{ ios: filtered ? 'xmark' : 'plus', android: filtered ? 'close' : 'add_comment' }} size={16} tintColor={colors.primaryText} />
        <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: 13 }}>
          {filtered ? 'Clear Filters' : 'Initialize Session'}
        </Text>
      </Pressable>
    </View>
  );
}

function DeleteSheet({
  conversation,
  onCancel,
  onConfirm,
}: {
  conversation: ConversationSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={conversation !== null}
      onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss delete confirmation" onPress={onCancel} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            gap: 16,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            backgroundColor: colors.surfaceLow,
          }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.outline }} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.error, fontFamily: fonts.monoMedium, fontSize: 10 }}>DESTRUCTIVE ACTION</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }}>Delete conversation?</Text>
          </View>
          <View style={{ gap: 4, padding: 12, borderRadius: 8, backgroundColor: colors.surface }}>
            <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 15 }}>
              {conversation?.title}
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              This permanently deletes the local chat record. Endpoint settings, credentials, and the model catalog remain unchanged.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <SmallButton label="Cancel" onPress={onCancel} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm Delete"
              onPress={onConfirm}
              style={({ pressed }) => ({
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 4,
                backgroundColor: colors.error,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: colors.primaryText, fontFamily: fonts.monoMedium, fontSize: 10 }}>Confirm Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
