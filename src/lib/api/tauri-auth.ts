import { invoke } from "@tauri-apps/api/core";

export interface AuthCommandError {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export interface SystemAuthStatus {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  label: string;
  detail?: string;
}

const FALLBACK_ERROR: AuthCommandError = {
  code: "unknown",
  message: "Une erreur d’authentification est survenue",
};

export function parseAuthCommandError(error: unknown): AuthCommandError {
  if (error && typeof error === "object") {
    const candidate = error as Partial<AuthCommandError>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return {
        code: candidate.code,
        message: candidate.message,
        retryAfterSeconds:
          typeof candidate.retryAfterSeconds === "number"
            ? candidate.retryAfterSeconds
            : undefined,
      };
    }
    if (typeof candidate.message === "string") {
      try {
        return parseAuthCommandError(JSON.parse(candidate.message));
      } catch {
        return { code: "unknown", message: candidate.message };
      }
    }
  }

  if (typeof error === "string") {
    try {
      return parseAuthCommandError(JSON.parse(error));
    } catch {
      const message = error.replace(/^.*Error:\s*/, "").trim();
      return { code: "unknown", message: message || FALLBACK_ERROR.message };
    }
  }

  return FALLBACK_ERROR;
}

export function formatRetryDelay(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  if (seconds < 120) return "1 minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  if (seconds < 7200) return "1 heure";
  return `${Math.ceil(seconds / 3600)} heures`;
}

export async function unlockWithPassword(password: string): Promise<void> {
  await invoke<boolean>("unlock", { password });
}

export async function recoverWithoutSystemAuth(password: string): Promise<void> {
  await invoke<boolean>("recover_without_system_auth", { password });
}

export async function getSystemAuthStatus(): Promise<SystemAuthStatus> {
  return invoke<SystemAuthStatus>("get_system_auth_status");
}

export async function configureSystemAuth(
  password: string,
  enabled: boolean,
): Promise<SystemAuthStatus> {
  return invoke<SystemAuthStatus>("configure_system_auth", { password, enabled });
}

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await invoke("change_master_password", { currentPassword, newPassword });
}
