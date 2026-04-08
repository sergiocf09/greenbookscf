import { defaultMarkerState, type MarkerState } from '@/types/golf';
import { isAutoDetectedMarker } from '@/lib/scoreDetection';
import { markerDbToKey, markerKeyToDb, type MarkerKey } from '@/lib/markerTypeMapping';

type HoleMarkerRow = {
  marker_type: string | null;
  is_auto_detected?: boolean | null;
  marker_count?: number | null;
};

const numericMarkerKeys: MarkerKey[] = ['manchaGenerica', 'unidadGenerica'];

export const isNumericMarkerKey = (key: MarkerKey): key is 'manchaGenerica' | 'unidadGenerica' =>
  numericMarkerKeys.includes(key);

export const restoreMarkerStateFromRows = (rows: HoleMarkerRow[] | null | undefined): MarkerState => {
  const next = { ...defaultMarkerState };

  for (const row of rows ?? []) {
    if (row.is_auto_detected) continue;
    const key = markerDbToKey(row.marker_type);
    if (!key || isAutoDetectedMarker(key)) continue;

    if (isNumericMarkerKey(key)) {
      // marker_count column stores the count directly (default 1 for old rows)
      const count = row.marker_count ?? 1;
      next[key] = ((next[key] as number) ?? 0) + count;
      continue;
    }

    next[key] = true;
  }

  return next;
};

export const expandMarkerStateToRows = (markers: MarkerState | null | undefined) => {
  const rows: Array<{ marker_type: string; is_auto_detected: false; marker_count: number }> = [];
  if (!markers) return rows;

  for (const [rawKey, rawValue] of Object.entries(markers) as [MarkerKey, MarkerState[MarkerKey]][]) {
    if (isAutoDetectedMarker(rawKey)) continue;

    const markerType = markerKeyToDb[rawKey];
    if (!markerType) continue;

    if (isNumericMarkerKey(rawKey)) {
      const count = Math.max(0, Number(rawValue) || 0);
      if (count > 0) {
        // Single row with count — respects UNIQUE(hole_score_id, marker_type)
        rows.push({
          marker_type: markerType,
          is_auto_detected: false,
          marker_count: count,
        });
      }
      continue;
    }

    if (rawValue) {
      rows.push({
        marker_type: markerType,
        is_auto_detected: false,
        marker_count: 1,
      });
    }
  }

  return rows;
};
