'use client';

import { useSerialScale } from '@/hooks/useSerialScale';

export function ScalePanel({
  onWeight,
  unitLabel = 'kg',
}: {
  onWeight: (weight: number) => void;
  unitLabel?: string;
}) {
  const { connected, error, lastLine, connect, disconnect } = useSerialScale(onWeight);

  return (
    <div className="pv-glass-item rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Báscula USB / serial</p>
          <p className="text-xs text-slate-500">
            Compatible con básculas Torrey, Systel y similares vía Web Serial (Chrome/Edge).
          </p>
        </div>
        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm"
          >
            Desconectar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Conectar báscula
          </button>
        )}
      </div>
      {connected && (
        <p className="mt-2 text-xs text-green-700">
          Conectada · coloca el producto y el peso se capturará en {unitLabel}
        </p>
      )}
      {lastLine && <p className="mt-1 font-mono text-xs text-slate-500">Última lectura: {lastLine}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
