import { invoke } from "@tauri-apps/api/core";

export type LicenseStatusKind = "trial" | "active" | "legacy" | "expired";

export interface LicenseStatusView {
  installation_id: string;
  status: LicenseStatusKind;
  license_type: string | null;
  license_key_masked: string | null;
  client_email: string | null;
  client_name: string | null;
  cabinet: string | null;
  activated_at: number;
  expires_at: number | null;
  installed_at: number;
  legacy: boolean;
  is_valid: boolean;
  days_remaining: number | null;
  needs_activation: boolean;
  registry_configured: boolean;
  registry_synced: boolean;
  trial_restart_count: number;
  can_restart_trial: boolean;
}

export async function needsLicenseActivation(): Promise<boolean> {
  return await invoke<boolean>("needs_license_activation_cmd");
}

export async function getLicenseStatus(): Promise<LicenseStatusView> {
  return await invoke<LicenseStatusView>("get_license_status_cmd");
}

export async function startLicenseTrial(input: {
  clientEmail: string;
  clientName?: string;
  cabinet?: string;
  allowRestart?: boolean;
}): Promise<LicenseStatusView> {
  return await invoke<LicenseStatusView>("start_license_trial_cmd", {
    clientEmail: input.clientEmail,
    clientName: input.clientName ?? null,
    cabinet: input.cabinet ?? null,
    allowRestart: input.allowRestart ?? false,
  });
}

export async function activateLicense(input: {
  licenseKey: string;
  clientEmail: string;
  clientName?: string;
  cabinet?: string;
}): Promise<LicenseStatusView> {
  return await invoke<LicenseStatusView>("activate_license_cmd", {
    licenseKey: input.licenseKey,
    clientEmail: input.clientEmail,
    clientName: input.clientName ?? null,
    cabinet: input.cabinet ?? null,
  });
}
