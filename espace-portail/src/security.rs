//! Rate-limit par adresse IP et en-têtes de sécurité HTTP.
//!
//! Les garde-fous par email (codes, échecs de connexion) ne protègent pas contre
//! un balayage massif d'adresses ou un pilonnage des endpoints depuis une même IP.

use std::collections::{HashMap, VecDeque};
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{header, HeaderValue, Request, Response, StatusCode},
    middleware::Next,
};
use axum::response::IntoResponse;

const GENERAL_LIMIT_PER_MINUTE: usize = 120;
const AUTH_LIMIT_PER_MINUTE: usize = 20;
const WINDOW: Duration = Duration::from_secs(60);
/// Seuil au-delà duquel les adresses inactives sont purgées de la table.
const MAX_TRACKED_IPS: usize = 10_000;

/// Compteur glissant en mémoire — suffisant pour une instance unique derrière Caddy.
#[derive(Default)]
pub struct IpRateLimiter {
    general: Mutex<HashMap<String, VecDeque<Instant>>>,
    auth: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl IpRateLimiter {
    fn allow(
        buckets: &Mutex<HashMap<String, VecDeque<Instant>>>,
        key: &str,
        limit: usize,
    ) -> bool {
        let now = Instant::now();
        let cutoff = now.checked_sub(WINDOW).unwrap_or(now);

        let mut guard = buckets.lock().expect("rate limiter lock");

        // Sans purge, chaque adresse vue laisse une entrée définitive : une
        // rotation d'IP, ou simplement des mois de trafic, feraient enfler la
        // table jusqu'à saturer la mémoire.
        if guard.len() > MAX_TRACKED_IPS {
            guard.retain(|_, seen| seen.back().is_some_and(|t| *t >= cutoff));
        }

        let bucket = guard.entry(key.to_string()).or_default();
        while bucket.front().is_some_and(|t| *t < cutoff) {
            bucket.pop_front();
        }
        if bucket.len() >= limit {
            return false;
        }
        bucket.push_back(now);
        true
    }

    pub fn allow_general(&self, key: &str) -> bool {
        Self::allow(&self.general, key, GENERAL_LIMIT_PER_MINUTE)
    }

    pub fn allow_auth(&self, key: &str) -> bool {
        Self::allow(&self.auth, key, AUTH_LIMIT_PER_MINUTE)
    }
}

#[derive(Clone, Copy)]
pub struct SecurityConfig {
    pub production: bool,
    pub trust_proxy: bool,
}

/// Un pair direct digne de confiance : le reverse proxy, forcément local ou
/// sur le réseau privé de la machine.
fn peer_is_trusted(peer: Option<IpAddr>) -> bool {
    match peer {
        Some(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        Some(IpAddr::V6(ip)) => ip.is_loopback() || ip.segments()[0] & 0xfe00 == 0xfc00,
        None => false,
    }
}

/// Adresse du client, en tenant compte du reverse proxy.
///
/// Les en-têtes `X-Real-IP` / `X-Forwarded-For` ne sont lus que si la requête
/// vient réellement du proxy : autrement, n'importe qui joignant le binaire en
/// direct changerait d'identité à chaque requête et contournerait entièrement
/// la limitation par IP.
pub fn client_ip<B>(request: &Request<B>, trust_proxy: bool) -> String {
    let peer = request
        .extensions()
        .get::<ConnectInfo<std::net::SocketAddr>>()
        .map(|info| info.0.ip());

    if trust_proxy && peer_is_trusted(peer) {
        if let Some(value) = request
            .headers()
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(ip) = value.trim().parse::<IpAddr>() {
                return ip.to_string();
            }
        }
        if let Some(value) = request
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
        {
            if let Some(first) = value.split(',').next() {
                if let Ok(ip) = first.trim().parse::<IpAddr>() {
                    return ip.to_string();
                }
            }
        }
    }

    peer.map(|ip| ip.to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn is_auth_path(path: &str) -> bool {
    path.starts_with("/api/v1/auth/")
}

pub async fn rate_limit_middleware(
    axum::extract::State((limiter, config)): axum::extract::State<(
        std::sync::Arc<IpRateLimiter>,
        SecurityConfig,
    )>,
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let path = request.uri().path();
    if path == "/health" {
        return next.run(request).await;
    }

    let path = path.to_string();
    let ip = client_ip(&request, config.trust_proxy);
    let allowed = if is_auth_path(&path) {
        limiter.allow_auth(&ip)
    } else {
        limiter.allow_general(&ip)
    };
    if !allowed {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            [(
                header::RETRY_AFTER,
                HeaderValue::from_static("60"),
            )],
            "Trop de requêtes. Réessayez dans une minute.",
        )
            .into_response();
    }
    next.run(request).await
}

pub fn apply_security_headers(response: &mut Response<Body>, production: bool) {
    let headers = response.headers_mut();
    set_header(
        headers,
        header::X_CONTENT_TYPE_OPTIONS,
        "nosniff",
    );
    set_header(headers, header::X_FRAME_OPTIONS, "DENY");
    set_header(
        headers,
        header::REFERRER_POLICY,
        "strict-origin-when-cross-origin",
    );
    set_header(
        headers,
        header::HeaderName::from_static("permissions-policy"),
        "camera=(), microphone=(), geolocation=(), payment=()",
    );
    set_header(
        headers,
        header::CONTENT_SECURITY_POLICY,
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; \
         base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    if production {
        set_header(
            headers,
            header::STRICT_TRANSPORT_SECURITY,
            "max-age=31536000; includeSubDomains",
        );
    }
}

fn set_header(headers: &mut axum::http::HeaderMap, name: header::HeaderName, value: &str) {
    if let Ok(parsed) = HeaderValue::from_str(value) {
        headers.insert(name, parsed);
    }
}

pub async fn security_headers_middleware(
    axum::extract::State(config): axum::extract::State<SecurityConfig>,
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let mut response = next.run(request).await;
    apply_security_headers(&mut response, config.production);
    response
}

pub fn parse_bool_env(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_lowercase()).as_deref(),
        Some("1" | "true" | "oui" | "yes")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn general_limit_blocks_after_threshold() {
        let limiter = IpRateLimiter::default();
        let key = "203.0.113.1";
        for _ in 0..GENERAL_LIMIT_PER_MINUTE {
            assert!(limiter.allow_general(key));
        }
        assert!(!limiter.allow_general(key));
    }

    #[test]
    fn auth_limit_is_stricter_than_general() {
        let limiter = IpRateLimiter::default();
        let key = "203.0.113.2";
        for _ in 0..AUTH_LIMIT_PER_MINUTE {
            assert!(limiter.allow_auth(key));
        }
        assert!(!limiter.allow_auth(key));
        assert!(limiter.allow_general(key));
    }

    #[test]
    fn forwarded_headers_are_ignored_from_an_untrusted_peer() {
        let build = |peer: &str| {
            let mut request = Request::new(Body::empty());
            request
                .headers_mut()
                .insert("x-forwarded-for", HeaderValue::from_static("203.0.113.9"));
            request.extensions_mut().insert(ConnectInfo(
                peer.parse::<std::net::SocketAddr>().unwrap(),
            ));
            request
        };

        // Derrière le proxy local : l'en-tête fait foi.
        assert_eq!(client_ip(&build("127.0.0.1:5000"), true), "203.0.113.9");

        // Joint en direct depuis Internet : l'en-tête est ignoré, sinon
        // l'appelant choisirait son identite a chaque requete.
        assert_eq!(client_ip(&build("198.51.100.7:5000"), true), "198.51.100.7");

        // Sans confiance dans le proxy, on ne lit jamais l'en-tête.
        assert_eq!(client_ip(&build("127.0.0.1:5000"), false), "127.0.0.1");
    }

    #[test]
    fn inactive_addresses_are_evicted() {
        let limiter = IpRateLimiter::default();
        for index in 0..(MAX_TRACKED_IPS + 50) {
            assert!(limiter.allow_general(&format!("10.0.{}.{}", index / 256, index % 256)));
        }
        let tracked = limiter.general.lock().unwrap().len();
        assert!(tracked <= MAX_TRACKED_IPS + 51, "table non purgee : {tracked}");
    }

    #[test]
    fn security_headers_include_csp_and_hsts_in_production() {
        let mut response = Response::new(Body::empty());
        apply_security_headers(&mut response, false);
        assert!(response.headers().contains_key(header::CONTENT_SECURITY_POLICY));
        assert!(!response.headers().contains_key(header::STRICT_TRANSPORT_SECURITY));

        apply_security_headers(&mut response, true);
        assert!(response.headers().contains_key(header::STRICT_TRANSPORT_SECURITY));
    }
}
