export interface MultiDayDay {
  day_number: number;
  date: string; // 'YYYY-MM-DD'
  label?: string;
}

export interface MultiDayRulesJson {
  days: MultiDayDay[];
  aggregation: 'sum' | 'best_n';
  best_n?: number;
}
