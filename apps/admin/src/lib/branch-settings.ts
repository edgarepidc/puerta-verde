/** Flags stored in branches.settings JSON. */

export type BranchSettingsFlags = {
  usbScaleEnabled: boolean;
};

export function parseBranchSettingsFlags(settings: unknown): BranchSettingsFlags {
  const raw =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return {
    usbScaleEnabled: raw.usbScaleEnabled === true,
  };
}

export function mergeBranchSettings(
  current: unknown,
  patch: Partial<BranchSettingsFlags>,
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if (patch.usbScaleEnabled !== undefined) {
    base.usbScaleEnabled = patch.usbScaleEnabled;
  }
  return base;
}
