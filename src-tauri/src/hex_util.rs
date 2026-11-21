//! Encodage hexadécimal minuscule (empreintes SHA-256, identiques à l'ancien `{:x}`).

pub fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}
