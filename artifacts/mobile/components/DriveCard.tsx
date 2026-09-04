import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Drive } from '@/context/AppContext';
import * as Haptics from 'expo-haptics';

// Distance in px past which release triggers classification
const THRESHOLD = 90;
// Distance to animate the card off-screen on confirm
const OFFSCREEN = 460;

interface DriveCardProps {
  drive: Drive;
  onClassify: (id: string, category: 'business' | 'personal') => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DriveCard({ drive, onClassify, onDragStart, onDragEnd }: DriveCardProps) {
  const colors = useColors();
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        pan.setValue(0);
        onDragStart?.();
      },
      onPanResponderMove: (_evt, gs) => {
        pan.setValue(gs.dx);
      },
      onPanResponderRelease: (_evt, gs) => {
        onDragEnd?.();
        if (gs.dx > THRESHOLD) {
          if (Platform.OS !== 'web')
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(pan, {
            toValue: OFFSCREEN,
            duration: 210,
            useNativeDriver: true,
          }).start(() => onClassify(drive.id, 'business'));
        } else if (gs.dx < -THRESHOLD) {
          if (Platform.OS !== 'web')
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(pan, {
            toValue: -OFFSCREEN,
            duration: 210,
            useNativeDriver: true,
          }).start(() => onClassify(drive.id, 'personal'));
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
            friction: 7,
            tension: 80,
          }).start();
        }
      },
      // If the OS tries to steal the gesture mid-swipe (e.g. system edge
      // gesture), snap back cleanly instead of leaving the card stuck
      onPanResponderTerminate: () => {
        onDragEnd?.();
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 80,
        }).start();
      },
      // Don't let anything else grab the responder once we've claimed a swipe
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // Right-swipe: green Business hint fades in from 0 → THRESHOLD
  const rightOpacity = pan.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Left-swipe: gray Personal hint fades in from -THRESHOLD → 0
  const leftOpacity = pan.interpolate({
    inputRange: [-THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const dateStr = new Date(drive.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>

      {/* ── Business reveal (right swipe) — green, anchored left ── */}
      <Animated.View
        style={[styles.revealBg, styles.revealLeft, { backgroundColor: colors.success, opacity: rightOpacity }]}
        pointerEvents="none"
      >
        <Ionicons name="briefcase" size={20} color="#fff" />
        <Text style={styles.revealTextLight}>Business</Text>
      </Animated.View>

      {/* ── Personal reveal (left swipe) — muted, anchored right ── */}
      <Animated.View
        style={[styles.revealBg, styles.revealRight, { backgroundColor: colors.muted, opacity: leftOpacity }]}
        pointerEvents="none"
      >
        <Text style={[styles.revealTextMuted, { color: colors.mutedForeground }]}>Personal</Text>
        <Ionicons name="person" size={20} color={colors.mutedForeground} />
      </Animated.View>

      {/* ── Swipeable card surface ── */}
      <Animated.View
        style={[styles.card, { backgroundColor: colors.card, transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.row}>
          {/* Unclassified dot indicator */}
          <View style={[styles.dotWrap, { backgroundColor: colors.warning + '22' }]}>
            <View style={[styles.dot, { backgroundColor: colors.warning }]} />
          </View>

          <View style={styles.info}>
            <View style={styles.routeRow}>
              <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={1}>
                {drive.startAddress}
              </Text>
              <Feather name="arrow-right" size={12} color={colors.mutedForeground} style={styles.arrow} />
              <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={1}>
                {drive.endAddress}
              </Text>
            </View>
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{dateStr}</Text>
              <View style={[styles.sep, { backgroundColor: colors.border }]} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {drive.startTime} – {drive.endTime}
              </Text>
            </View>
          </View>

          <View style={styles.milesBadge}>
            <Text style={[styles.milesVal, { color: colors.teal }]}>{drive.miles.toFixed(1)}</Text>
            <Text style={[styles.milesUnit, { color: colors.mutedForeground }]}>mi</Text>
          </View>
        </View>

        {/* Directional hint */}
        <View style={styles.hintRow}>
          <Feather name="chevron-left" size={11} color={colors.mutedForeground} />
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Personal
          </Text>
          <View style={[styles.hintDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Business
          </Text>
          <Feather name="chevron-right" size={11} color={colors.mutedForeground} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    position: 'relative',
  },

  // Reveal backgrounds — behind the card
  revealBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  revealLeft: { justifyContent: 'flex-start' },
  revealRight: { justifyContent: 'flex-end' },
  revealTextLight: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  revealTextMuted: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Card surface
  card: {
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  arrow: { flexShrink: 0 },
  address: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  sep: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  milesBadge: { alignItems: 'flex-end', flexShrink: 0 },
  milesVal: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    lineHeight: 20,
  },
  milesUnit: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

  // Bottom directional hint
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    opacity: 0.6,
  },
  hintText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  hintDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 2,
  },
});
