export interface OnboardingInput {
  organizationName: string;
  branchName: string;
  branchSlug: string;
  ownerName: string;
  email: string;
  password: string;
}

export function slugifyOrganizationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function validateOnboardingInput(input: OnboardingInput): string | null {
  if (!input.organizationName.trim()) return 'El nombre de la verdulería es obligatorio.';
  if (!input.branchName.trim()) return 'El nombre de la sucursal es obligatorio.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.branchSlug)) {
    return 'El slug solo puede tener minúsculas, números y guiones.';
  }
  if (input.branchSlug.length < 3) return 'El slug debe tener al menos 3 caracteres.';
  if (!input.ownerName.trim()) return 'Tu nombre es obligatorio.';
  if (!input.email.trim() || !input.email.includes('@')) return 'Correo inválido.';
  if (input.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  return null;
}
