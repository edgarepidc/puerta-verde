'use client';

import { useEffect, useState } from 'react';

import {
  connectThermalPrinter,
  getThermalPrinterError,
  getThermalPrinterInfo,
  getThermalPrinterKind,
  getThermalPrinterStatus,
  isThermalPrinterSupported,
  printThermalTest,
  reconnectThermalPrinter,
  subscribeThermalPrinter,
  type ThermalPrinterStatus,
} from '@/lib/thermal-printer';

export function useThermalPrinter() {
  const [status, setStatus] = useState<ThermalPrinterStatus>(() =>
    typeof navigator === 'undefined' ? 'disconnected' : getThermalPrinterStatus(),
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kind, setKind] = useState(getThermalPrinterKind);

  useEffect(() => {
    const sync = () => {
      setStatus(getThermalPrinterStatus());
      setError(getThermalPrinterError());
      setInfo(getThermalPrinterInfo());
      setKind(getThermalPrinterKind());
    };
    sync();
    const unsubscribe = subscribeThermalPrinter(sync);
    void reconnectThermalPrinter().finally(sync);
    return unsubscribe;
  }, []);

  return { status, error, info, kind, supported: isThermalPrinterSupported() };
}

export function ThermalPrinterBar() {
  const { status, error, info, kind, supported } = useThermalPrinter();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const message = localError || error;

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

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Para la térmica de 58 mm usa <strong>Chrome o Edge</strong> en esta computadora.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${status === 'ready' ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-hidden
        />
        <span className="font-medium text-slate-800">
          {status === 'ready'
            ? kind === 'ble'
              ? 'Impresora lista (Bluetooth)'
              : kind === 'usb'
                ? 'Impresora lista (USB)'
                : 'Puerto serie abierto'
            : status === 'connecting'
              ? 'Conectando impresora…'
              : 'Impresora térmica'}
        </span>
        <button
          type="button"
          disabled={busy}
          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => run(() => connectThermalPrinter('ble'))}
        >
          Conectar Bluetooth
        </button>
        {status === 'ready' ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
            onClick={() => run(() => printThermalTest({ connectIfNeeded: false }))}
          >
            {busy ? 'Enviando…' : 'Probar'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
          onClick={() => run(() => connectThermalPrinter('usb'))}
        >
          USB
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Si en el Bluetooth del Mac ves <strong>BlueTooth Printer</strong> en azul, haz clic para
        desconectarla: el Mac la está usando y Chrome no puede verla. Luego pulsa{' '}
        <strong>Conectar Bluetooth</strong>. Con cable, usa <strong>USB</strong> (también desconéctala
        del Bluetooth del Mac).
      </p>
      {busy ? <p className="mt-1 text-xs text-slate-500">Enviando a la impresora…</p> : null}
      {info ? <p className="mt-1 text-xs text-emerald-700">{info}</p> : null}
      {message ? <p className="mt-1 text-xs text-rose-700">{message}</p> : null}
    </div>
  );
}
