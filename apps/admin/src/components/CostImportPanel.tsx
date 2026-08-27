'use client';

import { useState } from 'react';

import { formatMoney } from '@puertaverde/shared';

import type { CostImportPreviewRow } from '@/lib/cost-import';

export function CostImportPanel({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<CostImportPreviewRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) {
      setError('Selecciona un archivo primero.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/costs?preview=1', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo leer el archivo');

      setPreviewRows(payload.rows ?? []);
      setParseErrors(payload.parseErrors ?? []);
      setMessage(
        `${payload.matchedCount ?? 0} para actualizar · ${payload.createCount ?? 0} nuevos · ${payload.totalCount ?? 0} filas.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al previsualizar');
      setPreviewRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    const readyRows = previewRows;
    if (!readyRows.length) {
      setError('No hay filas listas para importar.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/import/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: readyRows }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo importar');

      const failedCount = payload.failed?.length ?? 0;
      setMessage(
        `Importados ${payload.imported ?? 0} productos` +
          (failedCount ? ` · ${failedCount} con error` : '') +
          (payload.skipped ? ` · ${payload.skipped} omitidos` : ''),
      );
      setPreviewRows([]);
      setFile(null);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pv-glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Importar catálogo desde Excel</h2>
          <p className="mt-1 text-sm text-slate-500">
            Carga masiva de catálogo (nombre, categoría, unidad y precio de venta). Costo y cantidad son
            opcionales; las entradas del día a día van en Compras.
          </p>
        </div>
        <a
          href="/api/import/costs?template=1"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Descargar plantilla
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Archivo</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-1 block w-full max-w-md text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreviewRows([]);
              setParseErrors([]);
              setMessage(null);
              setError(null);
            }}
          />
        </label>
        <button
          type="button"
          disabled={loading || !file}
          onClick={handlePreview}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? 'Procesando…' : 'Vista previa'}
        </button>
        {previewRows.length > 0 && (
          <button
            type="button"
            disabled={loading}
            onClick={handleImport}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirmar importación
          </button>
        )}
      </div>

      {parseErrors.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">
          {parseErrors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {previewRows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Fila</th>
                <th className="px-3 py-2">Producto (archivo)</th>
                <th className="px-3 py-2">Coincide con</th>
                <th className="px-3 py-2">Costo</th>
                <th className="px-3 py-2">Cantidad</th>
                <th className="px-3 py-2">Precio</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.rowNumber}</td>
                  <td className="px-3 py-2 font-medium">{row.productName}</td>
                  <td className="px-3 py-2">{row.matchedProductName ?? '—'}</td>
                  <td className="px-3 py-2">{row.unitCost != null ? formatMoney(row.unitCost) : '—'}</td>
                  <td className="px-3 py-2">{row.quantity ?? '—'}</td>
                  <td className="px-3 py-2">
                    {row.salePrice != null ? formatMoney(row.salePrice) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 font-medium ${
                      row.matched ? 'text-green-700' : 'text-sky-700'
                    }`}
                  >
                    {row.matched ? 'Actualizar' : 'Crear nuevo'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
