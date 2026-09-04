import React, { useState, useRef, useEffect } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp, Drive, DriveCategory } from '@/context/AppContext';
import { DriveCard } from '@/components/DriveCard';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

// Returns distance in miles between two lat/lng points
function haversineMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Noise-filtering thresholds
const MIN_ACCURACY_METERS = 25;   // discard readings worse than this
const MIN_SEGMENT_MILES = 0.02;   // ignore GPS jitter smaller than ~100 ft
const MIN_SPEED_MPH = 2;          // below this, assume it's noise, not travel

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

// ── Drive action sheet ─────────────────────────────────────────────────────────
// Shows when the user taps / long-presses a classified drive card.

interface DriveActionSheetProps {
  drive: Drive | null;
  onClose: () => void;
  onClassify: (id: string, category: DriveCategory) => void;
  onDelete: (id: string) => void;
  mileageRate: number;
}

function DriveActionSheet({ drive, onClose, onClassify, onDelete, mileageRate  }: DriveActionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (!drive) return null;

  const isBusiness = drive.category === 'business';
  const isPersonal = drive.category === 'personal';

  const act = (fn: () => void) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fn();
    onClose();
  };

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      act(() => onDelete(drive.id));
      return;
    }
    Alert.alert(
      'Delete Drive Record',
      'This cannot be undone. Remove this drive permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => act(() => onDelete(drive.id)) },
      ]
    );
  };

  const dateStr = new Date(drive.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Modal visible={!!drive} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={as.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[as.panel, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
        {/* Handle */}
        <View style={[as.handle, { backgroundColor: colors.border }]} />

        {/* Drive summary */}
        <View style={[as.driveSummary, { borderBottomColor: colors.border }]}>
          <View style={as.routeRow}>
            <Text style={[as.routeAddr, { color: colors.foreground }]} numberOfLines={1}>{drive.startAddress}</Text>
            <Feather name="arrow-right" size={12} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
            <Text style={[as.routeAddr, { color: colors.foreground }]} numberOfLines={1}>{drive.endAddress}</Text>
          </View>
          <Text style={[as.driveMeta, { color: colors.mutedForeground }]}>
            {dateStr} · {drive.miles.toFixed(1)} mi
            {isBusiness ? ` · ${fmt(drive.miles * mileageRate)} write-off` : ''}
          </Text>
        </View>

        {/* Actions */}
        {!isBusiness && (
          <TouchableOpacity
            style={[as.option, { borderBottomColor: colors.border }]}
            onPress={() => act(() => onClassify(drive.id, 'business'))}
            activeOpacity={0.8}
          >
            <View style={[as.optIcon, { backgroundColor: colors.teal + '20' }]}>
              <Ionicons name="briefcase" size={17} color={colors.teal} />
            </View>
            <Text style={[as.optLabel, { color: colors.foreground }]}>Change to Business</Text>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {!isPersonal && (
          <TouchableOpacity
            style={[as.option, { borderBottomColor: colors.border }]}
            onPress={() => act(() => onClassify(drive.id, 'personal'))}
            activeOpacity={0.8}
          >
            <View style={[as.optIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="person" size={17} color={colors.mutedForeground} />
            </View>
            <Text style={[as.optLabel, { color: colors.foreground }]}>Change to Personal</Text>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[as.option, { borderBottomColor: colors.border }]}
          onPress={() => act(() => onClassify(drive.id, 'unclassified'))}
          activeOpacity={0.8}
        >
          <View style={[as.optIcon, { backgroundColor: colors.warning + '20' }]}>
            <Ionicons name="help-circle-outline" size={17} color={colors.warning} />
          </View>
          <Text style={[as.optLabel, { color: colors.foreground }]}>Move back to Unclassified</Text>
          <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[as.option, as.optLast]}
          onPress={confirmDelete}
          activeOpacity={0.8}
        >
          <View style={[as.optIcon, { backgroundColor: colors.destructive + '20' }]}>
            <Feather name="trash-2" size={17} color={colors.destructive} />
          </View>
          <Text style={[as.optLabel, { color: colors.destructive }]}>Delete Drive Record</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const as = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 2,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  driveSummary: {
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeAddr: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  driveMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optLast: { borderBottomWidth: 0 },
  optIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
});

// ── Classified drive card ──────────────────────────────────────────────────────

interface ClassifiedCardProps {
  drive: Drive;
  onLongPress: (drive: Drive) => void;
  onBadgeTap: (drive: Drive) => void;
  onClassify: (id: string, category: DriveCategory) => void;
  mileageRate: number;
}

function ClassifiedCard({ drive, onLongPress, onBadgeTap, mileageRate }: ClassifiedCardProps) {
  const colors = useColors();
  const isBusiness = drive.category === 'business';
  const dateStr = new Date(drive.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <TouchableOpacity
      style={[
        cc.card,
        {
          backgroundColor: colors.card,
          borderColor: isBusiness ? colors.teal + '44' : colors.border,
        },
      ]}
      activeOpacity={0.88}
      onPress={() => onBadgeTap(drive)}
      onLongPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress(drive);
      }}
      delayLongPress={400}
    >
      <View style={cc.row}>
        {/* Badge — tap to open action sheet */}
        <View
          style={[
            cc.categoryPill,
            { backgroundColor: isBusiness ? colors.teal + '22' : colors.muted },
          ]}
        >
          <Ionicons
            name={isBusiness ? 'briefcase' : 'person'}
            size={12}
            color={isBusiness ? colors.teal : colors.mutedForeground}
          />
          <Text style={[cc.categoryText, { color: isBusiness ? colors.teal : colors.mutedForeground }]}>
            {isBusiness ? 'Business' : 'Personal'}
          </Text>
          {/* Small edit hint on the badge */}
          <Feather name="edit-2" size={9} color={isBusiness ? colors.teal + 'BB' : colors.mutedForeground + 'BB'} />
        </View>

        <View style={cc.routeWrap}>
          <Text style={[cc.addr, { color: colors.foreground }]} numberOfLines={1}>{drive.startAddress}</Text>
          <Feather name="arrow-right" size={11} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
          <Text style={[cc.addr, { color: colors.foreground }]} numberOfLines={1}>{drive.endAddress}</Text>
        </View>
      </View>

      <View style={cc.meta}>
        <Text style={[cc.metaDate, { color: colors.mutedForeground }]}>{dateStr}</Text>
        <Text style={[cc.metaMiles, { color: isBusiness ? colors.teal : colors.mutedForeground }]}>
          {drive.miles.toFixed(1)} mi
          {isBusiness ? ` · ${fmt(drive.miles * mileageRate)}` : ''}
        </Text>
      </View>

      {/* Long-press hint */}
      <Text style={[cc.holdHint, { color: colors.mutedForeground }]}>
        Tap badge or hold to edit
      </Text>
    </TouchableOpacity>
  );
}

const cc = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
  },
  categoryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  routeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    overflow: 'hidden',
  },
  addr: { fontSize: 12, fontFamily: 'Inter_500Medium', flexShrink: 1 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  metaMiles: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  holdHint: { fontSize: 9, fontFamily: 'Inter_400Regular', opacity: 0.5, textAlign: 'right' },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function MileageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { drives, isTracking, toggleTracking, classifyDrive, deleteDrive, addDrive, mileageRate } = useApp();
  const [locError, setLocError] = useState('');
  const [trackStartAddr, setTrackStartAddr] = useState('');
  const [actionDrive, setActionDrive] = useState<Drive | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false); // prevent scroll while swiping

  const distanceRef = useRef(0);
  const lastPointRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

  const unclassified = drives.filter((d) => d.category === 'unclassified');
  const classified   = drives.filter((d) => d.category !== 'unclassified');
  const businessMiles = drives.filter((d) => d.category === 'business').reduce((s, d) => s + d.miles, 0);
  const personalMiles = drives.filter((d) => d.category === 'personal').reduce((s, d) => s + d.miles, 0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleToggle = async () => {
    if (Platform.OS === 'web') { toggleTracking(); return; }

    if (!isTracking) {
      // ── Start tracking ──
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Location permission required for drive tracking.');
        return;
      }
      setLocError('');

      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setTrackStartAddr(geo ? [geo.name, geo.city].filter(Boolean).join(', ') : 'Current Location');

        // Reset accumulator and seed the first point
        distanceRef.current = 0;
        lastPointRef.current = {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          time: Date.now(),
        };
      } catch {
        setTrackStartAddr('Current Location');
      }

      // Start continuous watching
      watchSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,   // check every 5s
          distanceInterval: 10, // or every 10m, whichever comes first
        },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          const now = Date.now();

          // Discard low-confidence readings
          if (accuracy != null && accuracy > MIN_ACCURACY_METERS) return;

          const prev = lastPointRef.current;
          if (!prev) {
            lastPointRef.current = { lat: latitude, lon: longitude, time: now };
            return;
          }

          const segmentMiles = haversineMiles(prev.lat, prev.lon, latitude, longitude);
          const elapsedHours = (now - prev.time) / 1000 / 3600;
          const speedMph = elapsedHours > 0 ? segmentMiles / elapsedHours : 0;

          // Only count it if it's a real segment AND moving fast enough to be travel
          if (segmentMiles >= MIN_SEGMENT_MILES && speedMph >= MIN_SPEED_MPH) {
            distanceRef.current += segmentMiles;
          }

          lastPointRef.current = { lat: latitude, lon: longitude, time: now };
        }
      );

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleTracking();
    } else {
      // ── Stop tracking ──
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }

      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        const endAddr = geo ? [geo.name, geo.city].filter(Boolean).join(', ') : 'Current Location';
        const now = new Date();

        addDrive({
          date: now.toISOString().split('T')[0],
          startAddress: trackStartAddr || 'Start Location',
          endAddress: endAddr,
          miles: Math.round(distanceRef.current * 10) / 10,
          category: 'unclassified',
          startTime: 'earlier',
          endTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        });
      } catch {
        /* ignore */
      }

      distanceRef.current = 0;
      lastPointRef.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleTracking();
      setTrackStartAddr('');
    }
  };

  // Cleanup: remove watcher if user navigates away mid-track
  useEffect(() => {
    return () => {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
      }
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mileage</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>${mileageRate.toFixed(2)}/mi rate</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!scrollLocked}
      >
        {/* Auto-Tracker Card */}
        <View style={[styles.trackerCard, { backgroundColor: colors.card, borderColor: isTracking ? colors.teal : colors.border }]}>
          <View style={styles.trackerTop}>
            <View style={styles.trackerLeft}>
              <View style={[styles.trackerIconWrap, { backgroundColor: isTracking ? colors.teal + '22' : colors.muted }]}>
                <Ionicons name="navigate" size={20} color={isTracking ? colors.teal : colors.mutedForeground} />
              </View>
              <View>
                <Text style={[styles.trackerLabel, { color: colors.foreground }]}>Auto-Tracker</Text>
                <Text style={[styles.trackerSub, { color: isTracking ? colors.teal : colors.mutedForeground }]}>
                  {isTracking ? 'Drive in progress...' : 'Tap to start tracking'}
                </Text>
              </View>
            </View>
            <Switch
              value={isTracking}
              onValueChange={handleToggle}
              trackColor={{ false: colors.muted, true: colors.teal }}
              thumbColor={isTracking ? '#ffffff' : colors.mutedForeground}
              ios_backgroundColor={colors.muted}
            />
          </View>
          {isTracking && (
            <View style={[styles.activeBar, { backgroundColor: colors.teal + '15', borderTopColor: colors.teal + '33' }]}>
              <View style={[styles.pulseDot, { backgroundColor: colors.teal }]} />
              <Text style={[styles.activeText, { color: colors.teal }]}>
                Recording drive from {trackStartAddr || 'current location'}
              </Text>
            </View>
          )}
          {!!locError && (
            <View style={[styles.activeBar, { backgroundColor: colors.destructive + '15', borderTopColor: colors.destructive + '33' }]}>
              <Feather name="alert-circle" size={12} color={colors.destructive} />
              <Text style={[styles.activeText, { color: colors.destructive }]}>{locError}</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { val: `${businessMiles.toFixed(1)} mi`, label: 'Business', color: colors.teal },
            { val: `${personalMiles.toFixed(1)} mi`, label: 'Personal', color: colors.mutedForeground },
        { val: fmt(businessMiles * mileageRate), label: 'Write-off', color: colors.success },
          ].map((s) => (
            <View key={s.label} style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Unclassified Drives */}
        {unclassified.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>UNCLASSIFIED DRIVES</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.warning + '22' }]}>
                <Text style={[styles.countBadgeText, { color: colors.warning }]}>{unclassified.length}</Text>
              </View>
            </View>
            <Text style={[styles.swipeHint, { color: colors.mutedForeground }]}>
              Swipe right for Business, left for Personal
            </Text>
            {unclassified.map((d) => (
              <DriveCard key={d.id} drive={d} onClassify={classifyDrive} 
                onDragStart={() => setScrollLocked(true)}
                onDragEnd={() => setScrollLocked(false)}/>
            ))}
          </>
        )}

        {/* Classified Drives */}
        {classified.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CLASSIFIED DRIVES</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.teal + '22' }]}>
                <Text style={[styles.countBadgeText, { color: colors.teal }]}>{classified.length}</Text>
              </View>
            </View>
            {classified.map((d) => (
              <ClassifiedCard
                key={d.id}
                drive={d}
                onClassify={classifyDrive}
                onLongPress={setActionDrive}
                onBadgeTap={setActionDrive}
                mileageRate={mileageRate}
              />
            ))}
          </>
        )}

        {drives.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No drives yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Toggle the auto-tracker to record your first drive
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Classified drive action sheet */}
      <DriveActionSheet
        drive={actionDrive}
        onClose={() => setActionDrive(null)}
        onClassify={classifyDrive}
        onDelete={deleteDrive}
        mileageRate={mileageRate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },

  trackerCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  trackerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  trackerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackerIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  trackerLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  trackerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  activeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  activeText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  statsRow: { flexDirection: 'row', gap: 8 },
  statChip: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.3 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  countBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  swipeHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 240 },
});
