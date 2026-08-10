import { useEffect, useState } from "react";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";

export interface PortalPrivacyConfig {
  controller?: string;
  /** Mentions légales du cabinet, une par ligne. */
  controllerDetails?: string;
  contactEmail?: string;
  updatedLabel: string;
}

export interface PortalPrivacyProps {
  onBack: () => void;
}

export function PortalPrivacy({ onBack }: PortalPrivacyProps) {
  const [config, setConfig] = useState<PortalPrivacyConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/portal-config");
        if (!response.ok) return;
        const body = (await response.json()) as {
          privacy?: PortalPrivacyConfig;
        };
        if (!cancelled && body.privacy) {
          setConfig(body.privacy);
        }
      } catch {
        // Texte générique par défaut.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatedLabel = config?.updatedLabel ?? "août 2026";
  const controller = config?.controller?.trim();
  const contactEmail = config?.contactEmail?.trim();
  const controllerDetails = (config?.controllerDetails ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <main
      className={`${CP.root} flex min-h-[100dvh] flex-col items-center px-6 py-10`}
    >
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2">
          <p className="cp-kicker">Espace investisseur</p>
          <h1 className="text-xl font-medium tracking-tight text-[var(--cp-ink)]">
            Protection des données personnelles
          </h1>
          <p className="cp-caption text-[var(--cp-ink-muted)]">
            Dernière mise à jour : {updatedLabel}
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-6 text-sm leading-relaxed text-[var(--cp-ink-muted)]">
          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Responsable de traitement
            </h2>
            <p>
              {controller ? (
                <>
                  <span className="text-[var(--cp-ink)]">{controller}</span> est
                  responsable du traitement des données affichées dans cet espace.
                </>
              ) : (
                <>
                  Votre conseiller en gestion de patrimoine, identifié lors de
                  l&apos;activation de votre espace, est responsable du traitement
                  des données affichées dans cet espace.
                </>
              )}
            </p>
            {controllerDetails.length > 0 ? (
              <address className="not-italic text-[var(--cp-ink)]">
                {controllerDetails.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : null}
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Finalités
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Consultation de votre situation patrimoniale suivie par le cabinet</li>
              <li>Authentification sécurisée par code envoyé à votre adresse email</li>
              <li>
                Échange de documents demandés par votre conseiller (dépôt sécurisé
                sur l&apos;espace)
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Données traitées
            </h2>
            <p>
              Identité (nom, prénom), adresse email, données patrimoniales
              filtrées selon votre situation familiale, documents que vous déposez
              à la demande du cabinet, journal de connexion (date, type
              d&apos;événement). Les codes de connexion ne sont jamais conservés
              en clair.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Durées de conservation
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Codes de connexion : 15 minutes maximum</li>
              <li>Session sur votre appareil : 30 jours ou 30 minutes d&apos;inactivité</li>
              <li>
                Données patrimoniales sur le portail : tant que votre accès est
                actif
              </li>
              <li>
                Documents déposés : le temps du transfert vers le cabinet, puis
                suppression sur le portail
              </li>
              <li>Journal de connexion : 24 mois</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Destinataires et sous-traitants
            </h2>
            <p>
              Votre conseiller et son cabinet. L&apos;envoi des codes de
              connexion est assuré par un prestataire d&apos;emailing
              transactionnel (Brevo, Union européenne). L&apos;hébergement du
              portail est réalisé sur un serveur situé dans l&apos;Union
              européenne. Aucune donnée patrimoniale détaillée n&apos;est
              transmise par email.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Vos droits
            </h2>
            <p>
              Vous disposez d&apos;un droit d&apos;accès, de rectification,
              d&apos;effacement, de limitation, d&apos;opposition et de
              portabilité. Pour les exercer,{" "}
              {contactEmail ? (
                <>
                  contactez{" "}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-[var(--cp-ink)] underline-offset-2 hover:underline"
                  >
                    {contactEmail}
                  </a>
                  .
                </>
              ) : (
                <>contactez directement votre conseiller.</>
              )}{" "}
              Vous pouvez introduire une réclamation auprès de la CNIL
              (www.cnil.fr).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-[var(--cp-ink)]">
              Sécurité
            </h2>
            <p>
              Connexion chiffrée (HTTPS), authentification par code à usage
              unique, sessions révocables par votre conseiller. Les documents
              déposés sont analysés antivirus avant acceptation et ne restent
              pas indéfiniment en ligne.
            </p>
          </section>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[var(--cp-ink-muted)] underline-offset-2 hover:text-[var(--cp-ink)] hover:underline"
        >
          Retour à la connexion
        </button>
      </div>
    </main>
  );
}
