//! Calcul des occurrences suivantes pour les tâches récurrentes (UTC calendaire).

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};

const DAY_SEC: i64 = 86400;

/// Règle de récurrence sérialisée en JSON (`taches.recurrence`).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default)]
pub struct TacheRecurrence {
    /// `daily` | `weekly` | `monthly` | `yearly`
    pub freq: String,
    /// Tous les N jours / semaines / mois / ans (défaut 1).
    pub interval: Option<u32>,
    /// Mensuel / annuel : jour du mois (1–31, réduit au dernier jour si besoin).
    pub day_of_month: Option<u32>,
    /// Annuel : mois (1–12).
    pub month: Option<u32>,
    /// Hebdomadaire : jours ISO 1=lundi … 7=dimanche.
    pub weekdays: Option<Vec<u32>>,
    /// Fin optionnelle (timestamp Unix, minuit UTC inclus).
    pub until: Option<i64>,
}

impl TacheRecurrence {
    pub fn is_active(&self) -> bool {
        !self.freq.is_empty() && self.freq != "none"
    }
}

pub fn parse_recurrence_json(raw: Option<&str>) -> Option<TacheRecurrence> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    let rec: TacheRecurrence = serde_json::from_str(s).ok()?;
    if rec.is_active() {
        Some(rec)
    } else {
        None
    }
}

pub fn serialize_recurrence_json(rec: Option<&TacheRecurrence>) -> Option<String> {
    let rec = rec?;
    if !rec.is_active() {
        return None;
    }
    serde_json::to_string(rec).ok()
}

fn utc_naive_date(ts: i64) -> NaiveDate {
    let days = (ts.max(0) / 86400) as i32;
    NaiveDate::from_num_days_from_ce_opt(719163 + days)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
}

fn unix_from_naive(d: NaiveDate) -> i64 {
    let days = d.num_days_from_ce() - 719163;
    days as i64 * DAY_SEC
}

fn iso_weekday(d: NaiveDate) -> u32 {
    d.weekday().num_days_from_monday() + 1
}

fn days_in_month(year: i32, month: u32) -> u32 {
    NaiveDate::from_ymd_opt(
        year,
        if month >= 12 { 12 } else { month + 1 },
        1,
    )
    .and_then(|d| d.pred_opt())
    .map(|d| d.day())
    .unwrap_or(28)
}

fn clamp_day_in_month(year: i32, month: u32, day: u32) -> u32 {
    let max = days_in_month(year, month);
    day.clamp(1, max)
}

fn add_months(year: i32, month: u32, delta: u32) -> (i32, u32) {
    let total = (year as i64) * 12 + (month as i64 - 1) + delta as i64;
    let y = (total / 12) as i32;
    let m = (total % 12 + 12) % 12 + 1;
    (y, m as u32)
}

fn next_daily(from_ts: i64, interval: u32) -> i64 {
    from_ts + interval as i64 * DAY_SEC
}

fn next_weekly(from_ts: i64, interval: u32, weekdays: Option<&[u32]>) -> Option<i64> {
    let interval = interval.max(1);
    match weekdays {
        None | Some([]) => Some(from_ts + 7 * interval as i64 * DAY_SEC),
        Some(days) if days.len() == 1 => {
            let target = days[0].clamp(1, 7);
            let from_date = utc_naive_date(from_ts);
            if iso_weekday(from_date) == target {
                return Some(from_ts + 7 * interval as i64 * DAY_SEC);
            }
            let mut d = from_date.succ_opt()?;
            for _ in 0..370 {
                if iso_weekday(d) == target {
                    return Some(unix_from_naive(d));
                }
                d = d.succ_opt()?;
            }
            None
        }
        Some(days) => {
            let normalized: Vec<u32> = days.iter().copied().map(|d| d.clamp(1, 7)).collect();
            let from_date = utc_naive_date(from_ts);
            let mut d = from_date.succ_opt()?;
            for _ in 0..370 {
                if normalized.contains(&iso_weekday(d)) {
                    return Some(unix_from_naive(d));
                }
                d = d.succ_opt()?;
            }
            None
        }
    }
}

fn next_monthly(from_ts: i64, interval: u32, day_of_month: u32) -> Option<i64> {
    let from_date = utc_naive_date(from_ts);
    let (y, m) = (from_date.year(), from_date.month());
    let (y2, m2) = add_months(y, m, interval.max(1));
    let day = if day_of_month == 0 {
        from_date.day()
    } else {
        clamp_day_in_month(y2, m2, day_of_month)
    };
    Some(unix_from_naive(NaiveDate::from_ymd_opt(y2, m2, day)?))
}

fn next_yearly(from_ts: i64, interval: u32, month: u32, day_of_month: u32) -> Option<i64> {
    let from_date = utc_naive_date(from_ts);
    let y = from_date.year() + interval.max(1) as i32;
    let m = month.clamp(1, 12);
    let day = if day_of_month == 0 {
        from_date.day()
    } else {
        clamp_day_in_month(y, m, day_of_month)
    };
    Some(unix_from_naive(NaiveDate::from_ymd_opt(y, m, day)?))
}

/// Prochaine échéance strictement après l'ancre (échéance de la tâche terminée).
pub fn next_occurrence(from_ts: i64, rec: &TacheRecurrence) -> Option<i64> {
    if !rec.is_active() {
        return None;
    }
    let interval = rec.interval.unwrap_or(1).max(1);
    let next = match rec.freq.as_str() {
        "daily" => Some(next_daily(from_ts, interval)),
        "weekly" => next_weekly(from_ts, interval, rec.weekdays.as_deref()),
        "monthly" => {
            let dom = rec.day_of_month.unwrap_or(utc_naive_date(from_ts).day());
            next_monthly(from_ts, interval, dom)
        }
        "yearly" => {
            let month = rec.month.unwrap_or(utc_naive_date(from_ts).month());
            let dom = rec
                .day_of_month
                .unwrap_or(utc_naive_date(from_ts).day());
            next_yearly(from_ts, interval, month, dom)
        }
        _ => None,
    }?;
    if let Some(until) = rec.until {
        if next > until {
            return None;
        }
    }
    Some(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(y: i32, m: u32, d: u32) -> i64 {
        unix_from_naive(NaiveDate::from_ymd_opt(y, m, d).unwrap())
    }

    #[test]
    fn monthly_day_two_advances_to_next_month() {
        let rec = TacheRecurrence {
            freq: "monthly".into(),
            interval: Some(1),
            day_of_month: Some(2),
            ..Default::default()
        };
        assert_eq!(next_occurrence(ts(2026, 3, 2), &rec), Some(ts(2026, 4, 2)));
        assert_eq!(next_occurrence(ts(2026, 1, 2), &rec), Some(ts(2026, 2, 2)));
    }

    #[test]
    fn monthly_day_31_clamps_in_february() {
        let rec = TacheRecurrence {
            freq: "monthly".into(),
            interval: Some(1),
            day_of_month: Some(31),
            ..Default::default()
        };
        assert_eq!(next_occurrence(ts(2026, 1, 31), &rec), Some(ts(2026, 2, 28)));
    }

    #[test]
    fn weekly_single_weekday_every_two_weeks() {
        let rec = TacheRecurrence {
            freq: "weekly".into(),
            interval: Some(2),
            weekdays: Some(vec![1]), // lundi
            ..Default::default()
        };
        // 2026-06-01 is Monday
        assert_eq!(next_occurrence(ts(2026, 6, 1), &rec), Some(ts(2026, 6, 15)));
    }

    #[test]
    fn weekly_multiple_weekdays_picks_next_day() {
        let rec = TacheRecurrence {
            freq: "weekly".into(),
            interval: Some(1),
            weekdays: Some(vec![1, 5]), // lun, ven
            ..Default::default()
        };
        // 2026-06-01 lun → ven 5
        assert_eq!(next_occurrence(ts(2026, 6, 1), &rec), Some(ts(2026, 6, 5)));
        // ven 5 → lun 8
        assert_eq!(next_occurrence(ts(2026, 6, 5), &rec), Some(ts(2026, 6, 8)));
    }

    #[test]
    fn daily_interval_respected() {
        let rec = TacheRecurrence {
            freq: "daily".into(),
            interval: Some(3),
            ..Default::default()
        };
        assert_eq!(next_occurrence(ts(2026, 6, 1), &rec), Some(ts(2026, 6, 4)));
    }

    #[test]
    fn until_stops_recurrence() {
        let rec = TacheRecurrence {
            freq: "monthly".into(),
            interval: Some(1),
            day_of_month: Some(1),
            until: Some(ts(2026, 3, 1)),
            ..Default::default()
        };
        assert_eq!(next_occurrence(ts(2026, 1, 1), &rec), Some(ts(2026, 2, 1)));
        assert_eq!(next_occurrence(ts(2026, 2, 1), &rec), Some(ts(2026, 3, 1)));
        assert_eq!(next_occurrence(ts(2026, 3, 1), &rec), None);
    }
}
