/**
 * Super-admin de plataforma.
 *
 * Preferimos PLATFORM_ADMIN_EMAILS (lista separada por comas) porque no depende
 * de una migración aplicada. Si existe profiles.is_platform_admin, también cuenta.
 */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.trim().toLowerCase());
}
