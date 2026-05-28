//! Normalisation des noms — alignée sur `src/lib/contacts/name-match.ts`.

pub fn normalize_contact_name(value: &str) -> String {
    let upper = value.trim().to_uppercase();
    let mut out = String::new();
    let mut last_was_space = false;

    for ch in upper.chars() {
        let mapped: Option<char> = match ch {
            'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => Some('A'),
            'È' | 'É' | 'Ê' | 'Ë' => Some('E'),
            'Ì' | 'Í' | 'Î' | 'Ï' => Some('I'),
            'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' => Some('O'),
            'Ù' | 'Ú' | 'Û' | 'Ü' => Some('U'),
            'Ç' => Some('C'),
            'Ñ' => Some('N'),
            'Œ' => Some('O'),
            'Æ' => Some('A'),
            '\'' | '`' | '\u{2019}' => None,
            c if c.is_whitespace() => {
                if !out.is_empty() && !last_was_space {
                    out.push(' ');
                    last_was_space = true;
                }
                None
            }
            c => Some(c),
        };

        if let Some(c) = mapped {
            out.push(c);
            last_was_space = false;
        }
    }

    out.trim().to_string()
}

pub fn contact_name_key(nom: &str, prenom: &str) -> String {
    format!(
        "{}|{}",
        normalize_contact_name(nom),
        normalize_contact_name(prenom)
    )
}

/// Clé canonique (nom/prénom inversés = même personne).
pub fn contact_name_key_canonical(nom: &str, prenom: &str) -> String {
    let a = normalize_contact_name(nom);
    let b = normalize_contact_name(prenom);
    if a <= b {
        format!("{a}|{b}")
    } else {
        format!("{b}|{a}")
    }
}

pub fn names_match(nom_a: &str, prenom_a: &str, nom_b: &str, prenom_b: &str) -> bool {
    let key_a = contact_name_key(nom_a, prenom_a);
    key_a == contact_name_key(nom_b, prenom_b) || key_a == contact_name_key(prenom_b, nom_b)
}
