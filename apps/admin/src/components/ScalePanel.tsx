'use client';

import { ActionChip } from '@/components/ActionChip';
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
          <ActionChip emoji="🔌" onClick={() => void disconnect()}>
            Desconectar
          </ActionChip>
        ) : (
          <ActionChip tone="emerald" emoji="⚖️" onClick={() => void connect()}>
            Conectar báscula
          </ActionChip>
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
