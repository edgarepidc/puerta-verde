'use client';

import { useEffect, useRef, useState } from 'react';

import {
  connectThermalPrinter,
  printThermalTest,
  type ThermalPrinterStatus,
} from '@/lib/thermal-printer';

import { useThermalPrinter } from '@/components/ThermalPrinterBar';

const STATUS_UI: Record<
  ThermalPrinterStatus | 'unsupported',
  { label: string; dot: string; card: string }
> = {
  ready: {
    label: 'Conectada',
    dot: 'bg-emerald-500',
    card: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  connecting: {
    label: 'Conectando…',
    dot: 'bg-amber-400',
    card: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  disconnected: {
    label: 'Desconectada',
    dot: 'bg-rose-500',
    card: 'border-rose-300 bg-rose-50 text-rose-900',
  },
  unsupported: {
    label: 'No disponible',
    dot: 'bg-slate-400',
    card: 'border-slate-300 bg-slate-50 text-slate-700',
  },
};

export function ThermalPrinterChip() {
  const { status, error, info, kind, supported } = useThermalPrinter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const ui = STATUS_UI[supported ? status : 'unsupported'];
  const message = localError || error;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setLocalError(null);
    try {
      await action();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'No se pudo hablar con la impresora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium shadow-sm ${ui.card}`}
        aria-expanded={open}
        aria-label={`Printer, ${ui.label.toLowerCase()}`}
        title={`Printer · ${ui.label}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${ui.dot}`} aria-hidden />
        <span>Printer</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
          {!supported ? (
            <p className="text-slate-600">
              Usa <strong>Chrome o Edge</strong> en esta computadora para la térmica de 58 mm.
            </p>
          ) : (
            <>
              <p className="font-medium text-slate-900">
                {status === 'ready'
                  ? kind === 'ble'
                    ? 'Lista (Bluetooth)'
                    : kind === 'usb'
                      ? 'Lista (USB)'
                      : 'Puerto serie abierto'
                  : 'Impresora térmica'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Si el Mac tiene la impresora en azul en Bluetooth, desconéctala ahí primero.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() => run(() => connectThermalPrinter('ble'))}
                >
                  Bluetooth
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
                  onClick={() => run(() => connectThermalPrinter('usb'))}
                >
                  USB
                </button>
                {status === 'ready' ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
                    onClick={() => run(() => printThermalTest({ connectIfNeeded: false }))}
                  >
                    {busy ? 'Enviando…' : 'Probar'}
                  </button>
                ) : null}
              </div>
              {busy ? <p className="mt-2 text-xs text-slate-500">Trabajando…</p> : null}
              {info ? <p className="mt-2 text-xs text-emerald-700">{info}</p> : null}
              {message ? <p className="mt-2 text-xs text-rose-700">{message}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
