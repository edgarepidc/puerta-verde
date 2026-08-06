'use client';

import { useEffect, useState } from 'react';

import { formatMoney } from '@puertaverde/shared';

interface CashSummary {
  closingDate: string;
  branchName: string;
  totals: { cash: number; card_terminal: number; transfer: number; online: number };
  orderCount: number;
  grandTotal: number;
  closing: {
    id: string;
    notes: string | null;
    created_at: string;
  } | null;
}

export function CashClosingManager() {
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la caja');
      setSummary(payload);
      setNotes(payload.closing?.notes ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function closeDay() {
    setClosing(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cerrar la caja');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando caja del día...</p>;
  }

  if (!summary) return null;

  const rows = [
    { label: 'Efectivo', value: summary.totals.cash },
    { label: 'TPV / terminal', value: summary.totals.card_terminal },
    { label: 'Transferencia', value: summary.totals.transfer },
  ];

  return (
    <div className="space-y-6">
      <section className="pv-glass-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Corte de caja</h2>
            <p className="text-sm text-slate-500">
              {summary.branchName} · {summary.closingDate} · {summary.orderCount} pagos registrados
            </p>
          </div>
          {summary.closing && (
            <span className="pv-callout px-3 py-1 text-xs font-medium">Cerrado hoy</span>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <div key={row.label} className="pv-glass-item rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{row.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(row.value)}</p>
            </div>
          ))}
          <div className="pv-glass-item rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total del día</p>
            <p className="mt-1 text-xl font-bold text-[var(--pv-green-800)]">
              {formatMoney(summary.grandTotal)}
            </p>
          </div>
        </div>
      </section>

      <section className="pv-glass-card p-6">
        <label className="block text-sm font-medium text-slate-700">
          Notas del cierre
          <textarea
            className="pv-input mt-2"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. faltante de $20 en caja chica"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={closing}
          onClick={closeDay}
          className="pv-btn-primary mt-4 px-5 py-2 text-sm"
        >
          {closing ? 'Guardando...' : summary.closing ? 'Actualizar cierre' : 'Cerrar caja del día'}
        </button>
      </section>
    </div>
  );
}
