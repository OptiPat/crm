import {
  effectiveTeamRole,
  isTeamConfigured,
  type WorkspaceConfig,
} from "./team-capabilities";

export interface SendFromOption {
  value: string;
  label: string;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed.toLowerCase();
}

export function buildSendFromOptions(
  config: WorkspaceConfig,
  primaryEmail: string | null | undefined
): SendFromOption[] {
  if (!isTeamConfigured(config)) return [];

  const office = normalizeEmail(config.officeMailboxEmail);
  const primary = normalizeEmail(primaryEmail);
  const role = effectiveTeamRole(config);

  if (role === "secretary") {
    if (!office) return [];
    return [{ value: office, label: `Cabinet (${office})` }];
  }

  const options: SendFromOption[] = [];
  if (primary) {
    options.push({ value: primary, label: `Personnel (${primary})` });
  }
  if (office) {
    options.push({ value: office, label: `Cabinet (${office})` });
  }
  return options;
}

export function defaultSendFromEmail(
  config: WorkspaceConfig,
  primaryEmail: string | null | undefined
): string | null {
  const options = buildSendFromOptions(config, primaryEmail);
  if (options.length === 0) return null;
  if (effectiveTeamRole(config) === "secretary") {
    return options[0]?.value ?? null;
  }
  return normalizeEmail(primaryEmail) ?? options[0]?.value ?? null;
}

export function shouldShowSendFromSelector(
  config: WorkspaceConfig,
  primaryEmail: string | null | undefined
): boolean {
  return buildSendFromOptions(config, primaryEmail).length > 1;
}

export function isOfficeMailboxSender(
  config: WorkspaceConfig,
  senderEmail: string | null | undefined
): boolean {
  if (!isTeamConfigured(config)) return false;
  const office = normalizeEmail(config.officeMailboxEmail);
  const sender = normalizeEmail(senderEmail);
  return Boolean(office && sender === office);
}
