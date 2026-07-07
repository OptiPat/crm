//! Google Agenda — propositions de déplacements (lieu physique uniquement).

use super::month_time_bounds_rfc3339;
use crate::email::oauth_send::resolve_google_calendar_connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaCalendarTripProposal {
    pub event_id: String,
    pub date: String,
    pub summary: String,
    pub location: String,
    pub already_imported: bool,
}

#[derive(Debug, Deserialize)]
struct CalendarEventList {
    items: Option<Vec<CalendarEvent>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

/// Champs Google Calendar — `hangout_link` / `conference_data` servent à détecter les visios.
#[derive(Debug, Deserialize)]
struct CalendarEvent {
    id: Option<String>,
    summary: Option<String>,
    location: Option<String>,
    description: Option<String>,
    #[serde(rename = "hangoutLink", default)]
    hangout_link: Option<String>,
    #[serde(rename = "conferenceData", default)]
    conference_data: Option<ConferenceData>,
    status: Option<String>,
    start: Option<EventTime>,
}

#[derive(Debug, Deserialize)]
struct ConferenceData {
    #[serde(rename = "entryPoints", default)]
    entry_points: Option<Vec<ConferenceEntryPoint>>,
}

#[derive(Debug, Deserialize)]
struct ConferenceEntryPoint {
    #[serde(rename = "entryPointType", default)]
    entry_point_type: Option<String>,
    uri: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EventTime {
    #[serde(rename = "dateTime", default)]
    date_time: Option<String>,
    date: Option<String>,
}

fn google_token(app: &AppHandle) -> Result<String, String> {
    resolve_google_calendar_connection(app)?
        .map(|c| c.access_token)
        .ok_or_else(|| "Connectez Google Agenda dans Paramètres → Email.".into())
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_http_url(s: &str) -> bool {
    s.contains("://") || s.contains("href=")
}

fn is_booking_or_event_platform_url(s: &str) -> bool {
    const PLATFORMS: [&str; 7] = [
        "zenchef.com",
        "eventbrite",
        "calendly.com",
        "livestorm.co",
        "livestorm.io",
        "webinar",
        "zoom.us",
    ];
    let lower = s.to_lowercase();
    PLATFORMS.iter().any(|p| lower.contains(p))
}

fn is_generic_event_location_text(s: &str) -> bool {
    let lower = s.to_lowercase();
    const GENERIC: [&str; 4] = [
        "votre place est réservée",
        "votre réservation",
        "your seat is reserved",
        "this event has been scheduled",
    ];
    GENERIC.iter().any(|g| lower.contains(g))
}

fn normalize_location_for_analysis(raw: &str) -> String {
    strip_html_tags(raw)
        .split_whitespace()
        .filter(|w| !w.contains("://") && !w.contains("href="))
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn has_french_postal_code_in_plain_text(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    for i in 0..chars.len().saturating_sub(4) {
        if !chars[i..i + 5].iter().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let before_ok = i == 0 || !chars[i - 1].is_ascii_digit();
        let after_ok = i + 5 >= chars.len() || !chars[i + 5].is_ascii_digit();
        if !before_ok || !after_ok {
            continue;
        }
        let dept =
            (chars[i] as u32 - '0' as u32) * 10 + (chars[i + 1] as u32 - '0' as u32);
        if !(1..=98).contains(&dept) {
            continue;
        }
        if has_street_hint(s) {
            return true;
        }
        if i + 5 < chars.len() {
            let rest = chars[i + 5..].iter().collect::<String>();
            let next = rest.trim_start_matches(|c: char| c == ' ' || c == ',');
            if next.chars().next().is_some_and(|c| c.is_alphabetic()) {
                return true;
            }
        }
    }
    false
}

fn has_street_hint(s: &str) -> bool {
    let lower = format!(" {} ", s.to_lowercase());
    const HINTS: [&str; 12] = [
        " rue ",
        " avenue ",
        " av. ",
        " av ",
        " bd ",
        " boulevard ",
        " chemin ",
        " impasse ",
        " allée ",
        " route ",
        " zac ",
        " zone ",
    ];
    HINTS.iter().any(|h| lower.contains(h))
        || lower.contains(" place du ")
        || lower.contains(" place de ")
        || lower.contains(" place des ")
        || lower.starts_with("rue ")
        || lower.starts_with("avenue ")
}

fn looks_like_physical_address(s: &str) -> bool {
    let t = normalize_location_for_analysis(s);
    !t.is_empty() && (has_french_postal_code_in_plain_text(&t) || has_street_hint(&t))
}

fn looks_like_geocodable_place(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    if looks_like_physical_address(t) {
        return true;
    }
    let parts: Vec<&str> = t.split(',').map(str::trim).filter(|p| !p.is_empty()).collect();
    parts.len() >= 2
        && parts.last().is_some_and(|last| last.eq_ignore_ascii_case("France"))
        && parts[parts.len() - 2]
            .chars()
            .any(|c| c.is_alphabetic())
}

fn is_phone_number_location(s: &str) -> bool {
    let t = s.trim();
    if t.starts_with("tel:") || t.starts_with("callto:") {
        return true;
    }
    if !t.chars().all(|c| {
        c.is_ascii_digit()
            || c.is_whitespace()
            || matches!(c, '+' | '.' | '-' | '(' | ')' | '/')
    }) {
        return false;
    }
    let digits: usize = t.chars().filter(|c| c.is_ascii_digit()).count();
    digits >= 10 && digits <= 15
}

fn is_remote_only_location(loc: &str) -> bool {
    let t = loc.trim();
    if t.is_empty() || is_phone_number_location(t) {
        return true;
    }
    let lower = t.to_lowercase();
    if lower.contains("<a ") || lower.contains("href=") || contains_http_url(&lower) {
        if contains_remote_meeting_hint(&lower) || is_booking_or_event_platform_url(&lower) {
            return true;
        }
    }
    let normalized = normalize_location_for_analysis(t);
    if normalized.is_empty() {
        return contains_remote_meeting_hint(&lower) || is_booking_or_event_platform_url(&lower);
    }
    if is_generic_event_location_text(&normalized) {
        return true;
    }
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return contains_remote_meeting_hint(&lower) || is_booking_or_event_platform_url(&lower);
    }
    if normalized.eq_ignore_ascii_case("zoom")
        || normalized.eq_ignore_ascii_case("teams")
        || normalized.eq_ignore_ascii_case("visio")
        || normalized.eq_ignore_ascii_case("visioconf")
        || normalized.eq_ignore_ascii_case("google meet")
        || normalized.eq_ignore_ascii_case("webex")
        || normalized.eq_ignore_ascii_case("whereby")
    {
        return true;
    }
    if (contains_remote_meeting_hint(&lower) || is_booking_or_event_platform_url(&lower))
        && !looks_like_geocodable_place(&normalized)
    {
        return true;
    }
    false
}

fn is_virtual_tool_location(s: &str) -> bool {
    let lower = s.to_lowercase();
    const VIRTUAL: [&str; 9] = [
        "simulateur av",
        "simulateur",
        "simulation",
        "webinaire",
        "webinar",
        "masterclass",
        "livestorm",
        "visio",
        "teams",
    ];
    VIRTUAL.iter().any(|v| {
        lower == *v
            || lower.starts_with(&format!("{v} "))
            || lower.ends_with(&format!(" {v}"))
    })
}

fn is_event_pitch_text(s: &str) -> bool {
    let t = s.trim();
    t.len() >= 72 && t.chars().filter(|c| *c == '?').count() >= 2
}

fn is_booking_or_redirect_location(loc: &str) -> bool {
    let lower = loc.to_lowercase();
    contains_http_url(&lower)
        || is_booking_or_event_platform_url(&lower)
        || is_generic_event_location_text(loc)
}

fn try_location_from_field(loc: &str) -> Option<String> {
    let t = loc.trim();
    if t.is_empty()
        || is_remote_only_location(t)
        || is_virtual_tool_location(t)
        || is_event_pitch_text(t)
    {
        return None;
    }
    let normalized = normalize_location_for_analysis(t);
    if normalized.is_empty()
        || is_generic_event_location_text(&normalized)
        || is_virtual_tool_location(&normalized)
        || is_event_pitch_text(&normalized)
        || !looks_like_geocodable_place(&normalized)
    {
        return None;
    }
    Some(normalized)
}

fn has_video_conference(ev: &CalendarEvent) -> bool {
    if ev
        .hangout_link
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        return true;
    }
    ev.conference_data.as_ref().is_some_and(|conf| {
        conf.entry_points.as_ref().is_some_and(|eps| {
            eps.iter().any(|ep| {
                ep.entry_point_type
                    .as_deref()
                    .is_some_and(|t| t.eq_ignore_ascii_case("video"))
                    || ep
                        .uri
                        .as_deref()
                        .is_some_and(|u| contains_remote_meeting_hint(u))
            })
        })
    })
}

fn description_indicates_online_meeting(description: &str) -> bool {
    let lower = description.to_lowercase();
    contains_remote_meeting_hint(&lower)
        || lower.contains("participer par téléphone")
        || lower.contains("participer par telephone")
        || lower.contains("participate by phone")
}

fn event_is_online_without_physical_location(ev: &CalendarEvent) -> bool {
    if ev
        .location
        .as_deref()
        .and_then(|l| try_location_from_field(l))
        .is_some()
    {
        return false;
    }
    if has_video_conference(ev) {
        return true;
    }
    if ev
        .location
        .as_deref()
        .is_some_and(|l| is_virtual_tool_location(l.trim()))
    {
        return true;
    }
    ev.description
        .as_deref()
        .is_some_and(description_indicates_online_meeting)
}

fn extract_location_from_summary(summary: &str) -> Option<String> {
    let s = summary.trim();
    for prefix in ["Réservation chez ", "Reservation chez "] {
        if let Some(rest) = s.strip_prefix(prefix) {
            if let Some((venue, city)) = rest.rsplit_once(" - ") {
                let venue = venue.trim();
                let city = city.trim();
                if venue.len() >= 3
                    && city.len() >= 3
                    && city.chars().any(|c| c.is_alphabetic())
                    && !contains_http_url(city)
                {
                    return Some(format!("{venue}, {city}, France"));
                }
            }
        }
    }
    None
}

fn extract_address_from_text(text: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim();
        if line.len() < 8
            || is_virtual_tool_location(line)
            || is_remote_only_location(line)
            || contains_remote_meeting_hint(&line.to_lowercase())
        {
            continue;
        }
        if looks_like_physical_address(line) {
            return Some(line.to_string());
        }
    }
    None
}

/// Lieu utilisable pour un déplacement (champ Lieu Agenda, ou repli si lien de réservation).
fn resolve_event_location(ev: &CalendarEvent) -> Option<String> {
    if event_is_online_without_physical_location(ev) {
        return ev.summary.as_deref().and_then(extract_location_from_summary);
    }

    if let Some(loc) = ev.location.as_deref() {
        let t = loc.trim();
        if !t.is_empty() {
            if let Some(from_field) = try_location_from_field(loc) {
                return Some(from_field);
            }
            if !is_booking_or_redirect_location(t) {
                return None;
            }
        }
    }
    if ev
        .location
        .as_ref()
        .is_none_or(|l| l.trim().is_empty())
    {
        if let Some(from_desc) = ev
            .description
            .as_deref()
            .and_then(extract_address_from_text)
        {
            return Some(from_desc);
        }
    }
    ev.summary.as_deref().and_then(extract_location_from_summary)
}

fn is_visio_or_remote_event(ev: &CalendarEvent) -> bool {
    resolve_event_location(ev).is_none()
}

fn contains_remote_meeting_hint(hay: &str) -> bool {
    const REMOTE: [&str; 11] = [
        "meet.google.com",
        "zoom.us",
        "web.zoom.us",
        "teams.microsoft.com",
        "teams.live.com",
        "microsoft teams",
        "webex.com",
        "whereby.com",
        "visio",
        "visioconf",
        "google meet",
    ];
    REMOTE.iter().any(|k| hay.contains(k))
}

fn event_date_iso(ev: &CalendarEvent) -> Option<String> {
    if let Some(dt) = ev.start.as_ref()?.date_time.as_ref() {
        return dt.get(0..10).map(|s| s.to_string());
    }
    ev.start.as_ref()?.date.clone()
}

pub fn scan_compta_calendar_month(
    app: &AppHandle,
    year: i32,
    month: u32,
    imported_event_ids: &[String],
) -> Result<Vec<ComptaCalendarTripProposal>, String> {
    let token = google_token(app)?;
    let client = reqwest::blocking::Client::new();
    let (time_min, time_max) = month_time_bounds_rfc3339(year, month);

    let mut proposals = Vec::new();
    let mut page_token: Option<String> = None;
    for _ in 0..8 {
        let mut query: Vec<(&str, &str)> = vec![
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("maxResults", "250"),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ];
        if let Some(ref pt) = page_token {
            query.push(("pageToken", pt.as_str()));
        }
        let res = client
            .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
            .query(&query)
            .bearer_auth(&token)
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Agenda Google: {}", res.text().unwrap_or_default()));
        }
        let list: CalendarEventList = res.json().map_err(|e| e.to_string())?;
        if let Some(items) = list.items {
            for ev in items {
                if ev.status.as_deref() == Some("cancelled") {
                    continue;
                }
                if is_visio_or_remote_event(&ev) {
                    continue;
                }
                let Some(location) = resolve_event_location(&ev) else {
                    continue;
                };
                let Some(date) = event_date_iso(&ev) else {
                    continue;
                };
                let event_id = ev.id.unwrap_or_default();
                if event_id.is_empty() {
                    continue;
                }
                proposals.push(ComptaCalendarTripProposal {
                    already_imported: imported_event_ids.iter().any(|id| id == &event_id),
                    event_id,
                    date,
                    summary: ev.summary.unwrap_or_else(|| "RDV".into()),
                    location,
                });
            }
        }
        page_token = list.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    proposals.sort_by(|a, b| a.date.cmp(&b.date).then(a.summary.cmp(&b.summary)));
    Ok(proposals)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(location: &str, hangout: Option<&str>) -> CalendarEvent {
        CalendarEvent {
            id: Some("1".into()),
            summary: Some("RDV".into()),
            location: Some(location.into()),
            description: None,
            hangout_link: hangout.map(String::from),
            conference_data: None,
            status: Some("confirmed".into()),
            start: Some(EventTime {
                date_time: Some("2026-07-15T10:00:00+02:00".into()),
                date: None,
            }),
        }
    }

    #[test]
    fn skips_visio_and_empty_location() {
        assert!(is_visio_or_remote_event(&ev("", None)));
        assert!(is_visio_or_remote_event(&ev(
            "https://meet.google.com/abc",
            None
        )));
        assert!(!is_visio_or_remote_event(&ev("12 rue des Acacias, Montpellier", None)));
    }

    #[test]
    fn keeps_hybrid_meet_with_physical_address() {
        let mut event = ev("12 rue des Acacias, 34000 Montpellier", None);
        event.hangout_link = Some("https://meet.google.com/xyz".into());
        event.conference_data = Some(ConferenceData {
            entry_points: Some(vec![ConferenceEntryPoint {
                entry_point_type: Some("video".into()),
                uri: Some("https://meet.google.com/xyz".into()),
            }]),
        });
        assert!(!is_visio_or_remote_event(&event));
        assert_eq!(
            resolve_event_location(&event).as_deref(),
            Some("12 rue des Acacias, 34000 Montpellier")
        );
    }

    #[test]
    fn keeps_event_when_visio_in_title_but_address_in_location() {
        let mut event = ev("8 place du Marché, 34000 Montpellier", None);
        event.summary = Some("Point visio puis présentiel client".into());
        assert!(!is_visio_or_remote_event(&event));
    }

    #[test]
    fn extracts_address_from_description_when_location_empty() {
        let mut event = ev("", None);
        event.description = Some(
            "Notes client\n12 rue des Acacias, 34000 Montpellier\nAppeler avant".into(),
        );
        assert!(!is_visio_or_remote_event(&event));
        assert_eq!(
            resolve_event_location(&event).as_deref(),
            Some("12 rue des Acacias, 34000 Montpellier")
        );
    }

    #[test]
    fn skips_pure_visio_without_address() {
        let mut event = ev("", None);
        event.summary = Some("Visio client DUPONT".into());
        event.hangout_link = Some("https://meet.google.com/abc".into());
        assert!(is_visio_or_remote_event(&event));
    }

    #[test]
    fn skips_zoom_phone_and_teams_locations() {
        assert!(is_visio_or_remote_event(&ev("ZOOM", None)));
        assert!(is_visio_or_remote_event(&ev("0647085080", None)));
        assert!(is_visio_or_remote_event(&ev("Réunion Microsoft Teams", None)));
        assert!(is_visio_or_remote_event(&ev(
            "https://us02web.zoom.us/j/86163214549",
            None
        )));
    }

    #[test]
    fn keeps_physical_addresses_from_user_examples() {
        assert!(!is_visio_or_remote_event(&ev(
            "Fourchette & Tire-Bouchon, 6 Rue Robert Schuman, 34430 Saint-Jean-de-Védas, France",
            None,
        )));
        assert!(!is_visio_or_remote_event(&ev(
            "Mas Merlet, 30000 Nîmes, France",
            None,
        )));
        assert!(!is_visio_or_remote_event(&ev("2B Rue Mareschal, 34000 Montpellier", None)));
    }

    #[test]
    fn skips_zoom_html_and_virtual_event_text() {
        assert!(is_visio_or_remote_event(&ev(
            "<a href=\"https://us06web.zoom.us/j/6675998439\">https://us06web.zoom.us/j/6675998439</a>",
            None,
        )));
        assert!(is_visio_or_remote_event(&ev(
            "Votre place est réservée pour cet événement.",
            None,
        )));
    }

    #[test]
    fn resolves_restaurant_from_summary_when_location_is_booking_link() {
        let mut event = ev(
            "<a href=\"https://public.zenchef.com/fr/restaurants/361226/bookings/abc\">Votre réservation</a>",
            None,
        );
        event.summary = Some("Réservation chez Pampa Brasserie & Bar - Montpellier".into());
        assert!(!is_visio_or_remote_event(&event));
        assert_eq!(
            resolve_event_location(&event).as_deref(),
            Some("Pampa Brasserie & Bar, Montpellier, France")
        );
    }

    #[test]
    fn skips_virtual_tool_location_without_description_fallback() {
        let mut event = ev("Simulateur AV", None);
        event.summary = Some(
            "Suivi annuel / Arbitrage / Déclaration de revenus / Coaching (Sophie CHAPTAL)".into(),
        );
        event.description = Some(
            "Session en ligne\n12 rue des Acacias, 34000 Montpellier\nAppeler avant".into(),
        );
        assert!(is_visio_or_remote_event(&event));
    }

    #[test]
    fn skips_event_pitch_in_location_field() {
        let pitch = "Qui hérite ? De combien ? Comment ? A quels frais ? Quelles sont les étapes d'une succession ? Et surtout quelles solutions mettre en place ?";
        let mut event = ev(pitch, None);
        event.summary = Some("Atelier Transmission".into());
        event.description = Some(
            "Inscription confirmée\n8 place du Marché, 34000 Montpellier".into(),
        );
        assert!(is_visio_or_remote_event(&event));
    }

    #[test]
    fn skips_coaching_meet_with_simulateur_av() {
        let mut event = ev("Simulateur AV", None);
        event.summary = Some(
            "Suivi annuel / Arbitrage / Déclaration de revenus / Coaching (Sophie CHAPTAL)".into(),
        );
        event.hangout_link = Some("https://meet.google.com/set-zfmb-dbf".into());
        event.description = Some(
            "meet.google.com/set-zfmb-dbf\nParticiper par téléphone\nObjet de notre rencontre\nSimulateur AV\nDocuments à préparer".into(),
        );
        assert!(is_visio_or_remote_event(&event));
    }

    #[test]
    fn skips_coaching_meet_when_location_empty_and_meet_only_in_description() {
        let mut event = ev("", None);
        event.summary = Some(
            "Suivi annuel / Arbitrage / Déclaration de revenus / Coaching (Sophie CHAPTAL)".into(),
        );
        event.description = Some(
            "meet.google.com/set-zfmb-dbf\nParticiper par téléphone\nSimulateur AV".into(),
        );
        assert!(is_visio_or_remote_event(&event));
    }
}
