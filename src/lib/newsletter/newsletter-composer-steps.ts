export type NewsletterComposerStepId = "audience" | "content" | "prepare" | "send";

export type NewsletterComposerStep = {
  id: NewsletterComposerStepId;
  label: string;
  done: boolean;
  active: boolean;
};

export function computeNewsletterComposerSteps(input: {
  hasRecipients: boolean;
  hasContent: boolean;
  hasPreparedCampaign: boolean;
  hasSendProgress: boolean;
}): NewsletterComposerStep[] {
  const base = [
    { id: "audience" as const, label: "Destinataires", done: input.hasRecipients },
    { id: "content" as const, label: "Contenu", done: input.hasContent },
    { id: "prepare" as const, label: "Préparer", done: input.hasPreparedCampaign },
    { id: "send" as const, label: "Envoyer", done: input.hasSendProgress },
  ];

  const firstIncomplete = base.findIndex((step) => !step.done);
  const activeIndex = firstIncomplete === -1 ? base.length - 1 : firstIncomplete;

  return base.map((step, index) => ({
    ...step,
    active: index === activeIndex,
  }));
}
