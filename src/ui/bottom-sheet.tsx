import React from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, View } from 'react-native';

import { colors, motion } from './tokens';

type BottomSheetProps = {
  visible: boolean;
  dismissLabel: string;
  dismissDisabled?: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

type BottomSheetState = { mounted: boolean };

export class BottomSheet extends React.Component<BottomSheetProps, BottomSheetState> {
  state: BottomSheetState = { mounted: this.props.visible };
  private readonly backdropOpacity = new Animated.Value(0);
  private readonly sheetPosition = new Animated.Value(Dimensions.get('window').height);
  private currentAnimation: Animated.CompositeAnimation | null = null;

  componentDidMount() {
    if (this.props.visible) this.animate(true);
  }

  componentDidUpdate(previousProps: BottomSheetProps) {
    if (previousProps.visible === this.props.visible) return;

    if (this.props.visible) {
      this.setState({ mounted: true }, () => this.animate(true));
    } else {
      this.animate(false);
    }
  }

  componentWillUnmount() {
    this.currentAnimation?.stop();
  }

  private animate(open: boolean) {
    this.currentAnimation?.stop();
    const animation = Animated.parallel([
      Animated.timing(this.backdropOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? motion.backdropIn : motion.backdropOut,
        useNativeDriver: true,
      }),
      Animated.timing(this.sheetPosition, {
        toValue: open ? 0 : Dimensions.get('window').height,
        duration: open ? motion.sheetIn : motion.sheetOut,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    this.currentAnimation = animation;
    animation.start(({ finished }) => {
      if (!open && finished && !this.props.visible) this.setState({ mounted: false });
    });
  }

  render() {
    if (!this.state.mounted) return null;
    const { dismissDisabled = false, dismissLabel, onRequestClose, children } = this.props;

    return (
      <Modal
        visible
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (!dismissDisabled) onRequestClose();
        }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            accessibilityLabel={dismissLabel}
            accessibilityRole="button"
            accessible
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              opacity: this.backdropOpacity,
              backgroundColor: colors.backdrop,
            }}>
            <Pressable
              accessibilityLabel={dismissLabel}
              accessibilityRole="button"
              disabled={dismissDisabled}
              onPress={onRequestClose}
              style={{ flex: 1 }}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={{ transform: [{ translateY: this.sheetPosition }] }}>
            {children}
          </Animated.View>
        </View>
      </Modal>
    );
  }
}
