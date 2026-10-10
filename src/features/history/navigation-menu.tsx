import React from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Animated, Dimensions, Easing, FlatList, Keyboard, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConversationCursor, ConversationSummary } from '../../domain/conversation';
import { conversationRepository } from '../../services/persistence/conversation-store';
import { colors, fonts, interaction, motion, radius, spacing, typography } from '../../ui/tokens';
import { isNavigationSwipe } from './navigation-gesture';

type NavigationMenuProps = {
  onNewChat: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onOpenConversation: (id: string) => void;
  currentConversationId?: string | null;
  newChatDisabled?: boolean;
  children?: (trigger: React.ReactNode) => React.ReactNode;
};

type NavigationMenuState = {
  open: boolean;
  mounted: boolean;
  focused: string | null;
  conversations: ConversationSummary[];
  cursor: ConversationCursor | null;
  loading: boolean;
  loadError: boolean;
};

export class NavigationMenu extends React.Component<NavigationMenuProps, NavigationMenuState> {
  state: NavigationMenuState = {
    open: false, mounted: false, focused: null,
    conversations: [], cursor: null,
    loading: false, loadError: false,
  };
  private readonly backdropOpacity = new Animated.Value(0);
  private readonly panelPosition = new Animated.Value(-Dimensions.get('window').width);
  private currentAnimation: Animated.CompositeAnimation | null = null;
  private historyRequest = 0;
  private loadingHistory = false;
  private readonly openingGesture = PanResponder.create({
    // Capture setelah arah jelas agar tap dan scroll vertikal tetap milik konten.
    onMoveShouldSetPanResponderCapture: (_, gesture) => !this.state.mounted && isNavigationSwipe(gesture, 'open', spacing.small),
    onPanResponderRelease: (_, gesture) => {
      if (!this.state.mounted && isNavigationSwipe(gesture, 'open', interaction.touchTarget)) this.open();
    },
  });
  private readonly closingGesture = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => this.state.open && isNavigationSwipe(gesture, 'close', spacing.small),
    onPanResponderGrant: () => {
      if (this.state.open) this.currentAnimation?.stop();
    },
    onPanResponderMove: (_, gesture) => {
      if (!this.state.open) return;
      const width = Math.min(Dimensions.get('window').width * 0.85, 360);
      const position = Math.max(-width, Math.min(0, gesture.dx));
      this.panelPosition.setValue(position);
      this.backdropOpacity.setValue(1 + position / width);
    },
    onPanResponderRelease: (_, gesture) => {
      if (!this.state.open) return;
      if (isNavigationSwipe(gesture, 'close', interaction.touchTarget)) this.close();
      else this.animate(true);
    },
    onPanResponderTerminate: () => {
      if (this.state.open) this.animate(true);
    },
  });

  componentWillUnmount() {
    this.historyRequest++;
    this.currentAnimation?.stop();
  }

  private open = () => {
    if (this.state.mounted) return;
    Keyboard.dismiss();
    this.setState({ open: true, mounted: true, conversations: [], cursor: null, loadError: false }, () => {
      this.animate(true);
      void this.loadHistory(null);
    });
  };

  private close = (action?: () => void) => {
    if (!this.state.open) return;
    this.historyRequest++;
    this.loadingHistory = false;
    this.setState({ open: false }, () => this.animate(false, action));
  };

  private async loadHistory(cursor: ConversationCursor | null) {
    if (!this.state.open || this.loadingHistory) return;
    const request = ++this.historyRequest;
    this.loadingHistory = true;
    this.setState({ loading: true, loadError: false });
    try {
      const page = await conversationRepository.list(20, cursor);
      if (request !== this.historyRequest) return;
      this.setState((state) => ({
        conversations: cursor === null ? page.conversations : [...state.conversations, ...page.conversations],
        cursor: page.nextCursor,
      }));
    } catch {
      if (request === this.historyRequest) this.setState({ loadError: true });
    } finally {
      if (request === this.historyRequest) {
        this.loadingHistory = false;
        this.setState({ loading: false });
      }
    }
  }

  private animate(open: boolean, action?: () => void) {
    this.currentAnimation?.stop();
    const animation = Animated.parallel([
      Animated.timing(this.backdropOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? motion.backdropIn : motion.backdropOut,
        useNativeDriver: true,
      }),
      Animated.timing(this.panelPosition, {
        toValue: open ? 0 : -Dimensions.get('window').width,
        duration: open ? motion.sheetIn : motion.sheetOut,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    this.currentAnimation = animation;
    animation.start(({ finished }) => {
      if (!open && finished && !this.state.open) this.setState({ mounted: false }, action);
    });
  }

  private controlStyle(label: string, pressed: boolean, disabled = false) {
    return {
      minHeight: interaction.touchTarget,
      justifyContent: 'center' as const,
      borderRadius: radius.control,
      borderWidth: this.state.focused === label ? 2 : 0,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
    };
  }

  render() {
    const { children, newChatDisabled = false, onNewChat, onHistory, onSettings, onOpenConversation, currentConversationId } = this.props;
    const trigger = (
      <Pressable
        accessibilityRole="button" accessibilityLabel="Open navigation menu"
        accessibilityState={{ expanded: this.state.open }} onPress={this.open}
        onFocus={() => this.setState({ focused: 'menu' })} onBlur={() => this.setState({ focused: null })}
        style={({ pressed }) => ({ ...this.controlStyle('menu', pressed), width: interaction.touchTarget, alignItems: 'center' })}>
        <SymbolView name={{ ios: 'line.3.horizontal', android: 'menu' }} size={22} tintColor={colors.text} />
      </Pressable>
    );
    return (
      <>
        {children ? (
          <View testID="navigation-swipe-area" style={{ flex: 1 }} {...this.openingGesture.panHandlers}>
            {children(trigger)}
          </View>
        ) : trigger}
        {this.state.mounted && (
          <Modal testID="navigation-modal" visible transparent animationType="none" statusBarTranslucent onRequestClose={() => this.close()}>
            <View style={{ flex: 1 }}>
              <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: this.backdropOpacity, backgroundColor: colors.backdrop }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss navigation menu" onPress={() => this.close()} style={{ flex: 1 }} />
              </Animated.View>
              <Animated.View testID="navigation-panel" accessibilityViewIsModal {...this.closingGesture.panHandlers} style={{ width: '85%', maxWidth: 360, height: '100%', transform: [{ translateX: this.panelPosition }] }}>
                <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.sheet, padding: spacing.screen, gap: spacing.screen }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.small }}>
                    <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.title }}>MyLLM</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={() => this.close()}
                      onFocus={() => this.setState({ focused: 'close' })} onBlur={() => this.setState({ focused: null })}
                      style={({ pressed }) => ({ ...this.controlStyle('close', pressed), width: interaction.touchTarget, alignItems: 'center' })}>
                      <SymbolView name={{ ios: 'xmark', android: 'close' }} size={20} tintColor={colors.muted} />
                    </Pressable>
                  </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="New chat"
                      accessibilityState={{ disabled: newChatDisabled || !this.state.open }} disabled={newChatDisabled || !this.state.open}
                      onPress={() => this.close(onNewChat)} onFocus={() => this.setState({ focused: 'new' })} onBlur={() => this.setState({ focused: null })}
                      style={({ pressed }) => ({ ...this.controlStyle('new', pressed, newChatDisabled || !this.state.open), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.small, paddingHorizontal: spacing.medium })}>
                      <SymbolView name={{ ios: 'square.and.pencil', android: 'edit_square' }} size={20} tintColor={colors.primary} />
                      <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>New chat</Text>
                    </Pressable>
                  <View style={{ flex: 1, gap: spacing.small }}>
                    <Text accessibilityRole="header" style={{ color: colors.muted, fontFamily: fonts.headingMedium, fontSize: typography.body }}>History</Text>
                    <FlatList
                      data={this.state.conversations} keyExtractor={(item) => item.id}
                      contentContainerStyle={{ gap: spacing.xsmall }}
                      onEndReached={() => { if (this.state.cursor !== null && !this.state.loadError) void this.loadHistory(this.state.cursor); }}
                      renderItem={({ item }) => (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}
                          accessibilityState={{ selected: item.id === currentConversationId, disabled: !this.state.open }} disabled={!this.state.open}
                          onPress={() => this.close(() => onOpenConversation(item.id))}
                          onFocus={() => this.setState({ focused: item.id })} onBlur={() => this.setState({ focused: null })}
                          style={({ pressed }) => ({ ...this.controlStyle(item.id, pressed), backgroundColor: item.id === currentConversationId ? colors.surfaceHigh : colors.sheet, padding: spacing.medium, gap: spacing.xsmall })}>
                          <Text numberOfLines={2} style={{ color: item.id === currentConversationId ? colors.primary : colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>{item.title}</Text>
                          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>{item.activeModelId}</Text>
                        </Pressable>
                      )}
                      ListEmptyComponent={!this.state.loading && !this.state.loadError ? (
                        <View style={{ gap: spacing.xsmall, paddingVertical: spacing.medium }}>
                          <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>No conversations yet</Text>
                          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>Start a new chat to save a conversation.</Text>
                        </View>
                      ) : null}
                      ListFooterComponent={
                        this.state.loading ? (
                          <View accessibilityState={{ busy: true }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small, paddingVertical: spacing.medium }}>
                            <ActivityIndicator color={colors.primary} />
                            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>Loading conversations...</Text>
                          </View>
                        ) : this.state.loadError || this.state.cursor !== null ? (
                          <View style={{ gap: spacing.small }}>
                            {this.state.loadError && <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: typography.body }}>Could not load conversations. Try again.</Text>}
                            <Pressable accessibilityRole="button" accessibilityLabel={this.state.loadError ? 'Retry history' : 'Load more conversations'}
                              disabled={!this.state.open} accessibilityState={{ disabled: !this.state.open }}
                              onPress={() => { void this.loadHistory(this.state.cursor); }}
                              onFocus={() => this.setState({ focused: 'load' })} onBlur={() => this.setState({ focused: null })}
                              style={({ pressed }) => this.controlStyle('load', pressed)}>
                              <Text style={{ color: colors.secondary, fontFamily: fonts.headingMedium, fontSize: typography.body, textAlign: 'center' }}>{this.state.loadError ? 'Retry' : 'Load more'}</Text>
                            </Pressable>
                          </View>
                        ) : null
                      }
                    />
                  </View>
                  <View style={{ gap: spacing.small }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Manage history" disabled={!this.state.open} accessibilityState={{ disabled: !this.state.open }}
                      onPress={() => this.close(onHistory)} onFocus={() => this.setState({ focused: 'history' })} onBlur={() => this.setState({ focused: null })}
                      style={({ pressed }) => ({ ...this.controlStyle('history', pressed), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.small, paddingHorizontal: spacing.medium })}>
                      <SymbolView name={{ ios: 'clock.arrow.circlepath', android: 'history' }} size={20} tintColor={colors.muted} />
                      <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>Manage history</Text>
                    </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Settings" disabled={!this.state.open} accessibilityState={{ disabled: !this.state.open }}
                    onPress={() => this.close(onSettings)} onFocus={() => this.setState({ focused: 'settings' })} onBlur={() => this.setState({ focused: null })}
                    style={({ pressed }) => ({ ...this.controlStyle('settings', pressed), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.small, paddingHorizontal: spacing.medium })}>
                    <SymbolView name={{ ios: 'gearshape', android: 'settings' }} size={20} tintColor={colors.muted} />
                    <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>Settings</Text>
                  </Pressable>
                  </View>
                </SafeAreaView>
              </Animated.View>
            </View>
          </Modal>
        )}
      </>
    );
  }
}
