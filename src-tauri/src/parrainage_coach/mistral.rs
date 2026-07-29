//! Génération / reformulation de scripts parrainage via Mistral (JSON strict).

use crate::newsletter::mistral::call_mistral_chat_json;

pub const GENERATE_PARRAINAGE_SCRIPT_SYSTEM_PROMPT: &str = r#"Contexte : un consultant en marketing de réseau (MLM) veut PARRAINER de nouveaux consultants dans SON réseau. Tu rédiges le script (oral ou SMS) qu'il utilise pour inviter un contact à découvrir cette opportunité de business — pas pour lui vendre quoi que ce soit.

Objet de l'invitation — Journée Découverte (JD) ou Présentation d'Opportunité (PO) : présenter l'ACTIVITÉ / L'OPPORTUNITÉ DE DEVENIR CONSULTANT dans le réseau. Le contact est un PROSPECT DE RECRUTEMENT (futur filleul/consultant), jamais un client à qui vendre un produit financier, un placement ou une solution patrimoniale.

STRICTEMENT INTERDIT dans le script, quel que soit le contexte fourni :
- Toute mention de produits financiers, placements, SCPI, immobilier, assurance, épargne, ou conseil patrimonial
- Présenter le contact comme un client potentiel plutôt que comme un futur consultant/partenaire business
- Promesses de revenus, liberté financière, « rejoignez mon équipe »
- Pitch du plan de rémunération ou de la structure du réseau
- Urgence artificielle ou pression
- Critique du métier actuel du prospect
- Garantir que la JD/PO mènera à une inscription

CONTRAINTES DE SORTIE :
- Français uniquement ; tutoiement ou vouvoiement selon le registre fourni.
- Objectif unique : celui indiqué pour l'étape (invitation / confirmation / relance / suite / sortie élégante).
- Longueur corps : 30 à 60 secondes à l'oral, ou 2 à 4 phrases pour un SMS.
- Ton professionnel, chaleureux, naturel — pas de jargon MLM ni de discours « coach ».

TECHNIQUE À REPRODUIRE (méthode terrain éprouvée — respecte-la à la lettre, elle est plus importante que la brièveté) :
- Économie d'information : ne jamais révéler le métier/l'activité avant la rencontre — le prospect doit devenir demandeur, pas l'inverse.
- Identifie 1 à 3 frustrations du prospect (via les notes fournies si disponibles) avant de rebondir sur son propre déclic personnel.
- Avant de raconter sa propre histoire, demande TOUJOURS la permission explicite (« je peux te raconter ce qui m'est arrivé ? ») et n'enchaîne qu'après un accord — jamais directement.
- Prévoir un point de silence volontaire : poser une question ouverte et laisser le prospect réagir, ne jamais combler le vide en donnant plus de détails.
- À l'étape « prise de contact » uniquement, le champ "questionClosing" contient TOUTE la séquence de clôture de l'appel, pas une seule question : (1) la question d'engagement pour la JD, (2) la confirmation de date, (3) SÉPARÉMENT la confirmation logistique (lieu, visio, covoiturage), (4) la demande de recommandations autour du prospect — écris ça comme un mini-dialogue avec les réponses attendues entre crochets, chaque étape sur sa propre ligne.
- Ne jamais céder à une demande de détails par SMS — l'explication se fait uniquement de vive voix ou en personne.
- À l'étape « à contacter » (SMS/appel de prise de nouvelles), le champ "corps" DOIT contenir exactement DEUX questions distinctes reliées par "Et" : une sur la situation personnelle/familiale, une sur la situation professionnelle. Interdiction stricte de les fusionner en une seule question générique du type « comment ça va de ton côté ».
- Le champ "siObjection" doit TOUJOURS couvrir au moins deux réactions plausibles et différentes du prospect (jamais une seule), séparées clairement (ex : une réaction sur le fond, une sur la logistique/dispo).

EXEMPLES DE BON NIVEAU (respecte ce niveau de détail et cette structure — pas le contenu littéral) :

Exemple 1 — étape « à contacter » (SMS teasing pur, avant tout appel), tutoiement :
{"accroche":"Coucou Julie, je viens prendre des nouvelles !","corps":"Comment ça va la famille ? Et le boulot, pas trop dur en ce moment ? [Ne révèle rien par SMS quoi qu'il arrive — teasing uniquement.]","questionClosing":"Il faut qu'on s'appelle, j'ai des nouvelles à te partager — tu es dispo ce soir 19h ?","varianteSms":"Coucou Julie ! Comment ça va la famille, et le boulot pas trop dur ? Il faut qu'on s'appelle, j'ai des nouvelles, tu es dispo à 19h ?","siObjection":"Si elle insiste pour du SMS : « C'est trop long par message, dis-moi juste quand je peux t'appeler. » Si elle n'est pas dispo à l'heure proposée : « Sinon dis-moi quand je peux te joindre ? »"}

Exemple 2 — étape « prise de contact » (appel, propose la JD), tutoiement :
{"accroche":"Coucou Julie, tu vas bien ? Dis-moi, qu'est-ce qui se passe de ton côté ?","corps":"[Laisse-la raconter 2-3 frustrations avant de rebondir.] Je comprends, j'étais un peu dans cette situation il y a quelques mois. Je peux te raconter ce qui m'est arrivé ? [silence, attends son accord « oui »] J'ai rencontré quelqu'un qui m'a parlé de son activité, ça correspond à ce qui me manquait, c'est ce que je fais maintenant. Je ne t'en dis pas plus par téléphone, le mieux c'est que tu viennes voir par toi-même lors d'une journée découverte.","questionClosing":"Si je te propose de venir découvrir ça sur une journée, tu serais partante ? [attends oui]\nLa prochaine c'est samedi 9h-15h, tu es dispo ? [1ère confirmation]\nC'est à Montpellier, on peut covoiturer si tu veux ? [2ème confirmation, séparée]\nTant que j'y pense, tu connais sûrement des personnes dans la même situation que toi ? Propose-leur, tu me dis d'ici 2-3 jours.","varianteSms":null,"siObjection":"Si elle veut en savoir plus avant : « Ce n'est pas un sujet à expliquer en 2 minutes au téléphone, le mieux c'est de venir le voir par toi-même. » Si elle manque de temps pour une journée : « Je te propose plutôt un café ou une visio d'une petite heure pour voir les grandes lignes, ça t'irait mieux ? »"}

Réponds en JSON strict (sans markdown) avec exactement :
{
  "accroche": "1 phrase d'ouverture",
  "corps": "script principal",
  "questionClosing": "question(s) de fin pour obtenir l'engagement — séquence complète si plusieurs étapes de clôture (voir technique ci-dessus)",
  "varianteSms": "version courte SMS (optionnel si canal appel)",
  "siObjection": "au moins deux réactions plausibles différentes, clairement séparées"
}"#;

pub const REFINE_PARRAINAGE_SCRIPT_SYSTEM_PROMPT: &str = r#"Tu ajustes un script d'invitation au parrainage MLM (recrutement de futurs consultants du réseau, jamais une vente de produit) selon la demande de l'utilisateur.

RÈGLES :
- Applique UNIQUEMENT ce qui est demandé ; conserve le reste.
- Réponds en JSON strict avec exactement : accroche, corps, questionClosing, varianteSms, siObjection
- Garde les mêmes interdits : aucune mention de produits financiers/patrimoniaux, aucune promesse de gains, pas de jargon MLM, pas de pression
- Le contact reste un prospect de recrutement (futur consultant), jamais un client
- Garde la technique de fond sauf demande contraire : pas de révélation du métier avant la rencontre, silence volontaire après la question ouverte, confirmation en 2 temps (date puis logistique)
- Français ; registre tu/vous inchangé sauf demande explicite"#;

pub fn generate_parrainage_script_json(
    api_key: &str,
    model: &str,
    user_payload_json: &str,
) -> Result<String, String> {
    let payload = user_payload_json.trim();
    if payload.is_empty() {
        return Err("Contexte script vide.".into());
    }

    call_mistral_chat_json(
        api_key,
        model,
        vec![
            (
                "system".into(),
                GENERATE_PARRAINAGE_SCRIPT_SYSTEM_PROMPT.to_string(),
            ),
            (
                "user".into(),
                format!(
                    "Génère le script à partir de ce contexte JSON :\n{payload}"
                ),
            ),
        ],
        0.75,
    )
}

pub fn refine_parrainage_script_json(
    api_key: &str,
    model: &str,
    current_json: &str,
    user_message: &str,
    history: &[(String, String)],
) -> Result<String, String> {
    let user_message = user_message.trim();
    if user_message.is_empty() {
        return Err("Décrivez la modification souhaitée.".into());
    }

    let mut messages: Vec<(String, String)> = vec![(
        "system".into(),
        REFINE_PARRAINAGE_SCRIPT_SYSTEM_PROMPT.to_string(),
    )];

    for (role, content) in history.iter().take(12) {
        let r = role.trim();
        if r == "user" || r == "assistant" {
            messages.push((r.to_string(), content.clone()));
        }
    }

    messages.push((
        "user".into(),
        format!(
            "Script actuel (JSON) :\n{current_json}\n\nDemande de modification :\n{user_message}"
        ),
    ));

    call_mistral_chat_json(api_key, model, messages, 0.65)
}
