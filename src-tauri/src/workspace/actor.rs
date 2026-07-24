//! Identifiant d'acteur collaboration (email Microsoft équipe, normalisé).

pub fn normalize_actor_id(email: &str) -> String {
    email.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_actor_id_lowercases_and_trims() {
        assert_eq!(normalize_actor_id("  Conseiller@Example.COM  "), "conseiller@example.com");
    }
}
