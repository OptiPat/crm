//! Calcul distance km (Nominatim + OSRM), comme ComptaZen — côté Rust pour fiabilité réseau.

use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

const NOMINATIM_DELAY: Duration = Duration::from_millis(1100);
const MAX_QUERIES: usize = 6;
const USER_AGENT: &str = "PatrimoineCRM/1.0 (compta deplacements)";

#[derive(Debug, Clone, Copy)]
struct Coords {
    lat: f64,
    lng: f64,
}

static NOMINATIM_SLOT: OnceLock<Mutex<Instant>> = OnceLock::new();
static ORIGIN_CACHE: OnceLock<Mutex<Option<(String, Coords)>>> = OnceLock::new();

fn nominatim_slot() -> &'static Mutex<Instant> {
    NOMINATIM_SLOT.get_or_init(|| Mutex::new(Instant::now() - Duration::from_secs(2)))
}

fn origin_cache() -> &'static Mutex<Option<(String, Coords)>> {
    ORIGIN_CACHE.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Deserialize)]
struct NominatimHit {
    lat: String,
    lon: String,
}

#[derive(Debug, Deserialize)]
struct OsrmRouteResponse {
    code: String,
    routes: Option<Vec<OsrmRoute>>,
}

#[derive(Debug, Deserialize)]
struct OsrmRoute {
    distance: f64,
}

fn wait_nominatim_slot() {
    let mut last = nominatim_slot().lock().unwrap();
    let elapsed = last.elapsed();
    if elapsed < NOMINATIM_DELAY {
        thread::sleep(NOMINATIM_DELAY - elapsed);
    }
    *last = Instant::now();
}

fn round_km(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn geocode_query(client: &reqwest::blocking::Client, query: &str) -> Option<Coords> {
    wait_nominatim_slot();

    let response = client
        .get("https://nominatim.openstreetmap.org/search")
        .header("User-Agent", USER_AGENT)
        .query(&[
            ("format", "json"),
            ("q", query),
            ("countrycodes", "fr"),
            ("limit", "1"),
        ])
        .send()
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let hits: Vec<NominatimHit> = response.json().ok()?;
    let first = hits.first()?;
    Some(Coords {
        lat: first.lat.parse().ok()?,
        lng: first.lon.parse().ok()?,
    })
}

fn geocode_with_queries(
    client: &reqwest::blocking::Client,
    queries: &[String],
) -> Option<Coords> {
    for query in queries.iter().take(MAX_QUERIES) {
        if let Some(coords) = geocode_query(client, query) {
            return Some(coords);
        }
    }
    None
}

fn osrm_one_way_km(
    client: &reqwest::blocking::Client,
    origin: Coords,
    destination: Coords,
) -> Option<f64> {
    let url = format!(
        "https://router.project-osrm.org/route/v1/driving/{:.6},{:.6};{:.6},{:.6}?overview=false",
        origin.lng, origin.lat, destination.lng, destination.lat
    );
    let response = client.get(url).send().ok()?;
    if !response.status().is_success() {
        return None;
    }
    let data: OsrmRouteResponse = response.json().ok()?;
    if data.code != "Ok" {
        return None;
    }
    let meters = data.routes?.first()?.distance;
    Some(round_km(meters / 1000.0))
}

pub fn compute_driving_distance_km(
    origin: &str,
    destination: &str,
    origin_queries: Vec<String>,
    destination_queries: Vec<String>,
) -> Result<f64, String> {
    let origin = origin.trim();
    let destination = destination.trim();
    if origin.is_empty() || destination.is_empty() {
        return Err("Adresse vide".into());
    }

    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    let origin_coords = {
        let cache = origin_cache();
        let mut cache = cache.lock().unwrap();
        if let Some((cached_origin, coords)) = cache.as_ref() {
            if cached_origin == origin {
                Some(*coords)
            } else {
                None
            }
        } else {
            None
        }
        .or_else(|| {
            let coords = geocode_with_queries(&client, &origin_queries);
            if let Some(c) = coords {
                *cache = Some((origin.to_string(), c));
            }
            coords
        })
    };

    let origin_coords = origin_coords.ok_or_else(|| "Geocoding failed (départ)".to_string())?;
    let dest_coords = geocode_with_queries(&client, &destination_queries)
        .ok_or_else(|| "Geocoding failed (destination)".to_string())?;

    osrm_one_way_km(&client, origin_coords, dest_coords)
        .ok_or_else(|| "No route found".to_string())
}

pub fn reset_distance_cache() {
    if let Some(cache) = ORIGIN_CACHE.get() {
        *cache.lock().unwrap() = None;
    }
}
