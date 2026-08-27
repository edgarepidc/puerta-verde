import type { SupabaseClient } from '@supabase/supabase-js';

/** Find or create a unit for free-text department labels. */
export async function resolveDeliveryUnitId(
  supabase: SupabaseClient,
  branchId: string,
  deliveryUnit: string,
): Promise<string> {
  const label = deliveryUnit.trim();
  if (!label) {
    throw new Error('Ingresa tu domicilio para la entrega.');
  }

  const { data: buildings, error } = await supabase
    .from('buildings')
    .select('id, name, units(id, identifier)')
    .eq('branch_id', branchId);

  if (error) throw new Error(error.message);

  const needle = label.toLowerCase();
  for (const building of buildings ?? []) {
    const units = (building.units ?? []) as Array<{ id: string; identifier: string }>;
    for (const unit of units) {
      const composed = `${building.name} — ${unit.identifier}`.toLowerCase();
      const composedAlt = `${building.name} ${unit.identifier}`.toLowerCase();
      if (
        unit.identifier.toLowerCase() === needle ||
        composed === needle ||
        composedAlt === needle
      ) {
        return unit.id;
      }
    }
  }

  let buildingId = buildings?.[0]?.id as string | undefined;
  if (!buildingId) {
    const { data: createdBuilding, error: buildingError } = await supabase
      .from('buildings')
      .insert({ branch_id: branchId, name: 'Entrega' })
      .select('id')
      .single();
    if (buildingError || !createdBuilding) {
      throw new Error(buildingError?.message ?? 'No se pudo registrar el domicilio');
    }
    buildingId = createdBuilding.id;
  }

  const { data: createdUnit, error: unitError } = await supabase
    .from('units')
    .insert({ building_id: buildingId, identifier: label.slice(0, 80) })
    .select('id')
    .single();

  if (unitError || !createdUnit) {
    throw new Error(unitError?.message ?? 'No se pudo registrar el domicilio');
  }

  return createdUnit.id;
}
