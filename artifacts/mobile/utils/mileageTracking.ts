import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  getTrackingState,
} from '@/utils/mileageTracking';

export const LOCATION_TASK_NAME = 'taxsquid-background-location-task';

const STORAGE_KEY = 'taxsquid_mileage_tracking_state';

// ── Tunable thresholds ───────────────────────────────────────────────────────
const MIN_ACCURACY_METERS = 25;     // discard low-confidence GPS readings
const MIN_SEGMENT_MILES = 0.02;     // ignore jitter smaller than ~100 ft
const MIN_SPEED_MPH = 4;            // below this, treat as walking/noise, not driving
const STOP_SEGMENT_MS = 2 * 60 * 1000;   // 2 min stationary ends the current drive
const MIN_DRIVE_MILES = 0.1;        // discard a finished drive shorter than this

export interface TrackingState {
  isTracking: boolean;
  startAddress: string;
  startTime: number;          // epoch ms — when this segment started
  accumulatedMiles: number;
  lastPoint: { lat: number; lon: number; time: number } | null;
  lastMovementTime: number;   // epoch ms — last time real movement was detected
  pendingDrive: {
    startAddress: string;
    endLat: number;
    endLon: number;
    miles: number;
    startTime: number;
    endTime: number;
  } | null;                   // set by the background task when it auto-closes a segment
}

const DEFAULT_STATE: TrackingState = {
  isTracking: false,
  startAddress: '',
  startTime: 0,
  accumulatedMiles: 0,
  lastPoint: null,
  lastMovementTime: 0,
  pendingDrive: null,
};

export async function getTrackingState(): Promise<TrackingState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function setTrackingState(state: TrackingState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Background task — invoked directly by iOS/Android, independent of the app UI ──
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('Mileage background task error:', error.message);
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) ?? { locations: [] };
  if (!locations?.length) return;

  const state = await getTrackingState();
  if (!state.isTracking) return;

  for (const loc of locations) {
    const { latitude, longitude, accuracy } = loc.coords;
    const now = loc.timestamp ?? Date.now();

    if (accuracy != null && accuracy > MIN_ACCURACY_METERS) continue;

    const prev = state.lastPoint;
    if (!prev) {
      state.lastPoint = { lat: latitude, lon: longitude, time: now };
      state.lastMovementTime = now;
      continue;
    }

    const segmentMiles = haversineMiles(prev.lat, prev.lon, latitude, longitude);
    const elapsedHours = (now - prev.time) / 1000 / 3600;
    const speedMph = elapsedHours > 0 ? segmentMiles / elapsedHours : 0;

    if (segmentMiles >= MIN_SEGMENT_MILES && speedMph >= MIN_SPEED_MPH) {
      state.accumulatedMiles += segmentMiles;
      state.lastMovementTime = now;
    }
    state.lastPoint = { lat: latitude, lon: longitude, time: now };

    // ── Auto-segmentation: stopped for 2+ minutes → close out this drive ──
    const stoppedFor = now - state.lastMovementTime;
    if (stoppedFor >= STOP_SEGMENT_MS && state.accumulatedMiles >= MIN_DRIVE_MILES) {
      state.pendingDrive = {
        startAddress: state.startAddress,
        endLat: prev.lat,
        endLon: prev.lon,
        miles: Math.round(state.accumulatedMiles * 10) / 10,
        startTime: state.startTime,
        endTime: state.lastMovementTime,
      };
      // Start a fresh segment in case the device keeps moving later (e.g. a longer stop
      // mid-route) — the app picks up pendingDrive and saves it as a completed drive;
      // if movement resumes, tracking continues seamlessly as a new segment.
      state.accumulatedMiles = 0;
      state.startAddress = ''; // filled in lazily on next resolved point if needed
      state.startTime = now;
    } else if (stoppedFor >= STOP_SEGMENT_MS && state.accumulatedMiles < MIN_DRIVE_MILES) {
      // Stopped, but never moved enough to count as a real drive — just reset quietly
      state.accumulatedMiles = 0;
      state.startTime = now;
    }
  }

  await setTrackingState(state);
});

// ── Start/stop background tracking ──────────────────────────────────────────
export async function startBackgroundTracking(startAddress: string): Promise<void> {
  await setTrackingState({
    ...DEFAULT_STATE,
    isTracking: true,
    startAddress,
    startTime: Date.now(),
    lastMovementTime: Date.now(),
  });

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,      // background updates are throttled more conservatively
    distanceInterval: 20,
    showsBackgroundLocationIndicator: true, // iOS: shows the blue status-bar pill while tracking
    foregroundService: {
      notificationTitle: 'TaxSquid is tracking a drive',
      notificationBody: 'Recording mileage in the background for your tax records.',
    },
  });
}

export async function stopBackgroundTracking(): Promise<TrackingState> {
  const finalState = await getTrackingState();
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  await setTrackingState({ ...DEFAULT_STATE });
  return finalState;
}