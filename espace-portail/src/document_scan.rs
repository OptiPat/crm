//! Analyse antivirus des fichiers déposés (ClamAV / clamd).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// Debian démarre clamd sur un socket local, pas sur un port TCP : c'est le
/// réglage par défaut de la distribution, et il évite d'ouvrir un port de plus.
const DEFAULT_CLAMD_ADDR: &str = "/run/clamav/clamd.ctl";
const CHUNK_SIZE: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScanVerdict {
    Clean,
    Infected(String),
    Unavailable(String),
}

pub fn clamd_addr() -> String {
    std::env::var("ESPACE_CLAMD_ADDR").unwrap_or_else(|_| DEFAULT_CLAMD_ADDR.into())
}

/// Une adresse commençant par `/` désigne un socket local, sinon un port TCP.
fn is_unix_socket(addr: &str) -> bool {
    addr.starts_with('/')
}

/// Analyse un fichier en mémoire via le protocole INSTREAM de clamd.
pub fn scan_bytes(data: &[u8]) -> ScanVerdict {
    if data.is_empty() {
        return ScanVerdict::Unavailable("fichier vide".into());
    }

    let addr = clamd_addr();

    if is_unix_socket(&addr) {
        #[cfg(unix)]
        {
            use std::os::unix::net::UnixStream;
            let mut stream = match UnixStream::connect(&addr) {
                Ok(stream) => stream,
                Err(error) => {
                    return ScanVerdict::Unavailable(format!(
                        "clamd injoignable ({addr}) : {error}"
                    ));
                }
            };
            if stream.set_read_timeout(Some(Duration::from_secs(30))).is_err()
                || stream.set_write_timeout(Some(Duration::from_secs(30))).is_err()
            {
                return ScanVerdict::Unavailable("timeout clamd".into());
            }
            return stream_instream(&mut stream, data);
        }
        #[cfg(not(unix))]
        {
            return ScanVerdict::Unavailable(format!(
                "socket local clamd indisponible sur cette plateforme ({addr})"
            ));
        }
    }

    let socket_addr = match addr.parse() {
        Ok(parsed) => parsed,
        Err(_) => return ScanVerdict::Unavailable(format!("ESPACE_CLAMD_ADDR invalide : {addr}")),
    };
    let mut stream = match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5)) {
        Ok(stream) => stream,
        Err(error) => {
            return ScanVerdict::Unavailable(format!("clamd injoignable ({addr}) : {error}"));
        }
    };
    if stream.set_read_timeout(Some(Duration::from_secs(30))).is_err()
        || stream.set_write_timeout(Some(Duration::from_secs(30))).is_err()
    {
        return ScanVerdict::Unavailable("timeout réseau clamd".into());
    }

    stream_instream(&mut stream, data)
}

/// Protocole INSTREAM, indépendant du transport.
fn stream_instream<S: Read + Write>(stream: &mut S, data: &[u8]) -> ScanVerdict {
    if stream.write_all(b"zINSTREAM\0").is_err() {
        return ScanVerdict::Unavailable("échec handshake clamd".into());
    }

    let mut offset = 0;
    while offset < data.len() {
        let end = (offset + CHUNK_SIZE).min(data.len());
        let chunk = &data[offset..end];
        let len = (chunk.len() as u32).to_be_bytes();
        if stream.write_all(&len).is_err() || stream.write_all(chunk).is_err() {
            return ScanVerdict::Unavailable("échec envoi flux clamd".into());
        }
        offset = end;
    }

    if stream.write_all(&0u32.to_be_bytes()).is_err() {
        return ScanVerdict::Unavailable("échec fin de flux clamd".into());
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return ScanVerdict::Unavailable("réponse clamd illisible".into());
    }

    parse_clamd_response(&response)
}

fn parse_clamd_response(response: &str) -> ScanVerdict {
    // Le protocole `zINSTREAM` termine ses réponses par un octet nul, que
    // `trim` ne retire pas : sans ça, « stream: OK\0 » n'est pas reconnu.
    let line = response
        .lines()
        .next()
        .unwrap_or("")
        .trim_matches(|c: char| c.is_whitespace() || c == '\0');
    if line.ends_with("OK") {
        ScanVerdict::Clean
    } else if line.contains("FOUND") {
        ScanVerdict::Infected(line.to_string())
    } else {
        ScanVerdict::Unavailable(format!("réponse clamd inattendue : {line}"))
    }
}

pub fn require_clamd_available(production: bool) -> Result<(), String> {
    if !production {
        return Ok(());
    }
    match scan_bytes(b"%PDF-1.0\n") {
        ScanVerdict::Unavailable(detail) => Err(format!(
            "clamd requis en production mais injoignable ({detail})"
        )),
        _ => Ok(()),
    }
}

/// Refuse le dépôt si l'analyse échoue en production.
pub fn require_clean_scan(data: &[u8], production: bool) -> Result<(), String> {
    match scan_bytes(data) {
        ScanVerdict::Clean => Ok(()),
        ScanVerdict::Infected(detail) => Err(format!("Fichier refusé : menace détectée ({detail})")),
        ScanVerdict::Unavailable(detail) if production => Err(format!(
            "Analyse antivirus indisponible — dépôt refusé ({detail})"
        )),
        ScanVerdict::Unavailable(detail) => {
            tracing::warn!("clamd indisponible en dev — dépôt autorisé sans scan : {detail}");
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok_response() {
        assert_eq!(
            parse_clamd_response("stream: OK\n"),
            ScanVerdict::Clean
        );
    }

    #[test]
    fn parse_nul_terminated_response() {
        // Réponse réelle de clamd en mode `z` : terminée par un octet nul.
        assert_eq!(parse_clamd_response("stream: OK\0"), ScanVerdict::Clean);
        assert_eq!(
            parse_clamd_response("stream: Eicar-Test-Signature FOUND\0"),
            ScanVerdict::Infected("stream: Eicar-Test-Signature FOUND".into())
        );
    }

    #[test]
    fn parse_found_response() {
        assert_eq!(
            parse_clamd_response("stream: Eicar-Signature FOUND\n"),
            ScanVerdict::Infected("stream: Eicar-Signature FOUND".into())
        );
    }

    #[test]
    fn a_path_designates_a_local_socket() {
        assert!(is_unix_socket("/run/clamav/clamd.ctl"));
        assert!(!is_unix_socket("127.0.0.1:3310"));
        assert!(!is_unix_socket("localhost:3310"));
    }

    #[test]
    fn require_clean_allows_dev_when_clamd_down() {
        // Sans clamd local : Unavailable => autorisé hors production.
        let result = require_clean_scan(b"test", false);
        assert!(result.is_ok());
    }
}
