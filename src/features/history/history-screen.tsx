import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConversationCursor, ConversationSummary, TurnStatus } from '../../domain/conversation';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { pickConversation, shareConversation } from '../../services/persistence/catalog-transfer';
import { deleteStagedAttachments } from '../../services/attachments/files';
import { colors, fonts, interaction, radius, spacing, typography } from '../../ui/tokens';
import { BottomSheet } from '../../ui/bottom-sheet';
import { NavigationMenu } from './navigation-menu';

const PAGE_SIZE = 20;

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
  const [loadError, setLoadError] = useState<'first' | 'more' | null>(null);
  const firstRequest = useRef<Promise<void> | null>(null);
  const pageRequest = useRef<Promise<void> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [query, setQuery] = useState('');
  const [filterFocused, setFilterFocused] = useState(false);
  const [interruptedOnly, setInterruptedOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [transferring, setTransferring] = useState(false);
  const router = useRouter();

  const loadFirst = useCallback(() => {
    if (firstRequest.current !== null) return firstRequest.current;
    const pendingPage = pageRequest.current;
    const request = (async () => {
      setLoading(true);
      try {
        // Refresh menunggu halaman aktif agar hasil lama tidak menimpa daftar baru.
        await pendingPage;
        setLoadError(null);
        const page = await conversationRepository.list(PAGE_SIZE);
        setConversations(page.conversations);
        setCursor(page.nextCursor);
      } catch {
        setLoadError('first');
      } finally {
        setLoading(false);
        firstRequest.current = null;
      }
    })();
    firstRequest.current = request;
    return request;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFirst();
    }, [loadFirst]),
  );

  const loadMore = useCallback(() => {
    if (cursor === null || firstRequest.current !== null || pageRequest.current !== null) {
      return;
    }
    const request = (async () => {
      setLoadingMore(true);
      setLoadError(null);
      try {
        const page = await conversationRepository.list(PAGE_SIZE, cursor);
        setConversations((current) => [...current, ...page.conversations]);
        setCursor(page.nextCursor);
      } catch {
        setLoadError('more');
      } finally {
        setLoadingMore(false);
        pageRequest.current = null;
      }
    })();
    pageRequest.current = request;
    return request;
  }, [cursor]);

  const filtered = query.trim().length > 0 || interruptedOnly;
  const searching = filtered && (loading || cursor !== null) && loadError === null;

  useEffect(() => {
    if (filtered && !loading && !loadingMore && loadError === null) {
      void loadMore();
    }
  }, [filtered, loadError, loadMore, loading, loadingMore]);

  const saveTitle = useCallback(async (id: string) => {
    if (savingRef.current) return;
    const next = title.trim();
    if (next.length === 0) {
      setTitleError('Enter a conversation title.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setTitleError(null);
    try {
      await conversationRepository.rename(id, next);
      setEditingId(null);
      await loadFirst();
    } catch {
      setTitleError('Could not rename conversation. Try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [loadFirst, title]);

  const startEditing = useCallback((conversation: ConversationSummary) => {
    if (savingRef.current) return;
    setEditingId(conversation.id);
    setTitle(conversation.title);
    setTitleError(null);
  }, []);

  const cancelEditing = useCallback(() => {
    if (savingRef.current) return;
    setEditingId(null);
    setTitle('');
    setTitleError(null);
  }, []);

  const changeTitle = useCallback((value: string) => {
    setTitle(value);
    setTitleError(null);
  }, []);

  const startDeleting = useCallback((conversation: ConversationSummary) => {
    setDeleteTarget(conversation);
    setDeleteError(null);
  }, []);

  const cancelDeleting = useCallback(() => {
    if (deletingRef.current) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  const openConversation = useCallback((id: string) => {
    router.push({ pathname: '/chat/[conversationId]', params: { conversationId: id } });
  }, [router]);

  const startNewChat = useCallback(() => {
    router.push({ pathname: '/chat/[conversationId]', params: { conversationId: 'new' } });
  }, [router]);

  const deleteConversation = useCallback(async () => {
    if (deleteTarget === null || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await conversationRepository.remove(deleteTarget.id, deleteStagedAttachments);
      setDeleteTarget(null);
      await loadFirst();
    } catch {
      setDeleteError('Could not delete conversation. Try again.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
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
        onTitleChange={changeTitle}
        titleError={titleError}
        saving={saving}
        onOpen={openConversation}
        onStartEditing={startEditing}
        onCancelEditing={cancelEditing}
        onSave={saveTitle}
        onDelete={startDeleting}
        onExport={exportConversation}
        transferring={transferring}
      />
    ),
    [cancelEditing, changeTitle, editingId, exportConversation, openConversation, saveTitle, saving, startDeleting, startEditing, title, titleError, transferring],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <NavigationMenu onNewChat={startNewChat} onOpenConversation={openConversation} onHistory={() => router.replace('/history')} onSettings={() => router.push('/settings')}>
      {(trigger) => <>
      <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small }}>
          {trigger}
          <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.title }}>History</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.small }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import conversation"
            accessibilityState={{ busy: transferring, disabled: transferring }}
            disabled={transferring}
            onPress={() => void importConversation()}
            style={({ pressed }) => ({
              minHeight: interaction.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: colors.surfaceHigh,
              opacity: transferring ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
            })}>
            <Text style={{ color: colors.secondary, fontFamily: fonts.heading, fontSize: typography.body }}>Import</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={startNewChat}
            hitSlop={4}
            style={({ pressed }) => ({
              minHeight: interaction.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              opacity: pressed ? interaction.pressedOpacity : 1,
            })}>
            <SymbolView name={{ ios: 'plus', android: 'add' }} size={16} tintColor={colors.primaryText} />
            <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: typography.body }}>New chat</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
          Loaded conversations: {conversations.length}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: filterFocused ? colors.primary : colors.border,
              backgroundColor: colors.surfaceHigh,
            }}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={colors.outline} />
            <TextInput
              accessibilityLabel="Filter conversations"
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFilterFocused(true)}
              onBlur={() => setFilterFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Filter title, model, or status..."
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              style={{ flex: 1, minHeight: interaction.compactTouchTarget, paddingHorizontal: 8, color: colors.text, fontFamily: fonts.mono, fontSize: 11 }}
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
              width: interaction.compactTouchTarget,
              height: interaction.compactTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              backgroundColor: interruptedOnly ? colors.primary : colors.surfaceHigh,
              opacity: pressed ? interaction.pressedOpacity : 1,
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
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
            {filtered ? 'Searching conversations...' : 'Loading conversations...'}
          </Text>
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
          onEndReached={() => { if (!filtered && loadError === null) void loadMore(); }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={loadError !== null ? (
            <View style={{ gap: spacing.small, paddingVertical: spacing.medium }}>
              <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: typography.body }}>
                {loadError === 'first' ? 'Could not load conversations. Try again.' : 'Could not load more conversations. Try again.'}
              </Text>
              <SmallButton label="Retry" onPress={() => { void (loadError === 'first' ? loadFirst() : loadMore()); }} />
            </View>
          ) : null}
          ListEmptyComponent={searching || loadError !== null ? null : <EmptyHistory filtered={filtered} onPress={filtered ? () => { setQuery(''); setInterruptedOnly(false); } : startNewChat} />}
          ListFooterComponent={searching || loadingMore ? (
            <View style={{ gap: spacing.small, alignItems: 'center', paddingVertical: spacing.medium }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
                {searching ? 'Searching conversations...' : 'Loading more conversations...'}
              </Text>
            </View>
          ) : null}
          renderItem={renderConversation}
        />
      )}

      <DeleteSheet
        conversation={deleteTarget}
        busy={deleting}
        error={deleteError}
        onCancel={cancelDeleting}
        onConfirm={() => void deleteConversation()}
      />
      </>}
      </NavigationMenu>
    </SafeAreaView>
  );
}

const HistoryRow = memo(function HistoryRow({
  conversation,
  editing,
  title,
  onTitleChange,
  titleError,
  saving,
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
  titleError: string | null;
  saving: boolean;
  onOpen: (id: string) => void;
  onStartEditing: (conversation: ConversationSummary) => void;
  onCancelEditing: () => void;
  onSave: (id: string) => Promise<void>;
  onDelete: (conversation: ConversationSummary) => void;
  onExport: (conversation: ConversationSummary) => Promise<void>;
  transferring: boolean;
}) {
  const status = historyStatus(conversation.status);
  const [titleFocused, setTitleFocused] = useState(false);

  if (editing) {
    return (
      <View style={{ gap: 8, padding: 12, borderRadius: 8, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusBadge status={{ label: 'RENAMING', color: colors.secondary, detail: '' }} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
              {conversation.activeModelId}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>Conversation title</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 10,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: titleFocused ? colors.primary : colors.border,
            backgroundColor: colors.surfaceHigh,
          }}>
          <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={18} tintColor={colors.primary} />
          <TextInput
            accessibilityLabel="Conversation title"
            autoFocus
            value={title}
            editable={!saving}
            onChangeText={onTitleChange}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            onSubmitEditing={() => void onSave(conversation.id)}
            returnKeyType="done"
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={{ flex: 1, minHeight: interaction.compactTouchTarget, color: colors.text, fontFamily: fonts.mono, fontSize: 13 }}
          />
        </View>
        {titleError !== null ? <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: typography.body }}>{titleError}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <SmallButton label="Cancel" disabled={saving} onPress={onCancelEditing} />
          <SmallButton label={saving ? 'Saving...' : 'Save changes'} disabled={saving} tone="primary" onPress={() => void onSave(conversation.id)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ overflow: 'hidden', borderRadius: 8, backgroundColor: colors.surfaceLow }}>
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
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.surfaceLowest,
        }}>
        <Text style={{ flexGrow: 1, flexShrink: 1, color: status.color, fontFamily: fonts.mono, fontSize: 10 }}>
          {status.detail}
        </Text>
        <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
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

function SmallButton({ label, tone = 'secondary', disabled = false, onPress }: { label: string; tone?: 'secondary' | 'primary'; disabled?: boolean; onPress: () => void }) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: interaction.compactTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.medium,
        borderRadius: radius.control,
        backgroundColor: primary ? colors.primary : colors.surfaceHigh,
        opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
      })}>
      <Text style={{ color: primary ? colors.primaryText : colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>{label}</Text>
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
        {filtered ? 'No matching conversations' : 'No conversations yet'}
      </Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
        {filtered
          ? 'Try a different query or clear the interrupted filter.'
          : 'Start a new chat. Your conversations will appear here.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filtered ? 'Clear conversation filters' : 'Start a new chat'}
        onPress={onPress}
        hitSlop={4}
        style={({ pressed }) => ({
          minHeight: interaction.touchTarget,
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
          {filtered ? 'Clear filters' : 'New chat'}
        </Text>
      </Pressable>
    </View>
  );
}

function DeleteSheet({
  conversation,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  conversation: ConversationSummary | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet
      visible={conversation !== null}
      dismissLabel="Dismiss delete confirmation"
      dismissDisabled={busy}
      onRequestClose={onCancel}>
        <View
          style={{
            gap: 16,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
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
              This permanently deletes this conversation from this device.
            </Text>
          </View>
          {error !== null ? <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: typography.body }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
            <SmallButton label="Cancel" disabled={busy} onPress={onCancel} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm Delete"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={onConfirm}
              style={({ pressed }) => ({
                minHeight: interaction.compactTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 4,
                backgroundColor: colors.error,
                opacity: busy ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
              })}>
              <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: typography.body }}>{busy ? 'Deleting...' : 'Confirm Delete'}</Text>
            </Pressable>
          </View>
        </View>
    </BottomSheet>
  );
}
