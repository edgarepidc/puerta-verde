'use client';

import { useRouter } from 'next/navigation';

interface BranchOption {
  id: string;
  name: string;
  slug: string;
}

export function BranchSwitcher({
  branches,
  currentBranchId,
}: {
  branches: BranchOption[];
  currentBranchId: string;
}) {
  const router = useRouter();

  if (branches.length <= 1) return null;

  async function handleChange(branchId: string) {
    await fetch('/api/branch/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId }),
    });
    router.refresh();
  }

  return (
    <label className="text-sm text-slate-600">
      <span className="sr-only">Sucursal</span>
      <select
        className="pv-input py-1.5 text-sm"
        value={currentBranchId}
        onChange={(e) => handleChange(e.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}
