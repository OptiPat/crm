# Espace client — conformité RGPD

Document opérationnel pour le conseiller (responsable de traitement). À compléter avec les
coordonnées du cabinet et à conserver hors dépôt public.

## 1. Responsable de traitement

| Champ | Valeur |
|-------|--------|
| Responsable | *[Raison sociale / nom du cabinet]* |
| Contact | *[Email dédié RGPD du cabinet]* |
| Finalité principale | Mise à disposition d'un espace patrimonial sécurisé et échange documentaire avec les clients |

## 2. Registre des traitements (extrait espace client)

| Traitement | Base légale | Données | Durée de conservation |
|------------|-------------|---------|------------------------|
| Consultation patrimoine | Exécution du contrat de conseil (art. 6.1.b RGPD) | Identité, email, vue patrimoine filtrée (R2) | Tant que le contrat de conseil est actif + délai légal archivage |
| Authentification par code email | Exécution du contrat + intérêt légitime sécurité | Email, empreintes de codes (pas le code en clair), journal connexions | Codes OTP : 15 min ; sessions : 30 j max / 30 min inactivité ; journal : 24 mois |
| Envoi transactionnel (Brevo) | Sous-traitant — art. 28 RGPD | Email, contenu du message (code à 6 chiffres) | Logs Brevo selon contrat ; pas de contenu patrimonial dans les emails |
| Dépôt de documents (phase 2) | Exécution du contrat | Fichiers demandés par le conseiller | **Transit uniquement** : purge portail après rapatriement CRM (cible ≤ 7 jours) |
| Synchronisation CRM → portail | Exécution du contrat | Copie partielle du dossier client | Jusqu'à révocation de l'accès ou suppression côté CRM |

## 3. Sous-traitants

| Prestataire | Rôle | Localisation | DPA |
|-------------|------|--------------|-----|
| Hébergeur VPS | Hébergement binaire + SQLite portail | UE (à préciser) | Contrat hébergeur |
| Brevo | Envoi emails transactionnels (codes de connexion) | UE | [Contrat de sous-traitance Brevo](https://www.brevo.com/fr/legal/termsofuse/) — à activer sur le compte |

Aucune donnée patrimoniale nominative ne transite par Brevo : uniquement le code de connexion.

## 4. Droits des personnes

Le client peut exercer ses droits (accès, rectification, effacement, limitation, opposition,
portabilité) auprès du cabinet :

- **Email** : *[contact RGPD du cabinet]*
- **Délai de réponse** : 1 mois (art. 12 RGPD)

L'export complet du dossier reste géré depuis le CRM desktop (droit d'accès global).

## 5. Mention d'information client

Texte affiché sur le portail (`/confidentialite`) — à valider par le conseiller avant mise en ligne.

Points obligatoires couverts par la page portail :

- Identité du responsable de traitement
- Finalités (consultation patrimoine, authentification, futurs échanges documentaires)
- Durées de conservation
- Destinataires / sous-traitants (hébergeur, Brevo)
- Droits et contact
- Absence de décision automatisée

## 6. Sécurité (art. 32 RGPD)

Mesures en place sur la phase consultation :

- HTTPS obligatoire (Caddy + HSTS)
- Rate-limit par adresse IP
- En-têtes de sécurité (CSP, X-Frame-Options, etc.)
- Codes de connexion hashés, sessions révocables
- Cloisonnement conjugal côté serveur (R2)
- Analyse antivirus ClamAV sur les dépôts (phase 2, refus si indisponible en production)

## 7. Violation de données — procédure interne

1. **Containment** : révoquer l'accès concerné, couper le portail si compromission serveur
2. **Évaluation** : gravité, données exposées, nombre de personnes
3. **CNIL** : notification sous 72 h si risque pour les droits et libertés (art. 33)
4. **Personnes concernées** : information sans délai indu si risque élevé (art. 34)
5. **Rotation secrets** : `ESPACE_SYNC_SECRET`, clé Brevo, certificats TLS
6. **Trace** : journal des actions dans `espace_connexion_log` + logs Caddy

## 8. Checklist avant premier client réel

- [ ] Domaine + SPF/DKIM/DMARC pour `ESPACE_MAIL_FROM`
- [ ] Caddy actif, `ESPACE_PRODUCTION=1`, `ESPACE_TRUST_PROXY=1`
- [ ] Page `/confidentialite` relue et personnalisée
- [ ] Registre des traitements mis à jour dans le cabinet
- [ ] DPA Brevo signé
- [ ] Test de restauration sauvegarde `espace-portail.db`
- [ ] ClamAV actif (`clamd`) avant ouverture du dépôt de documents
