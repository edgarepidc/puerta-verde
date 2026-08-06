'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { parseScaleWeightLine } from '@puertaverde/shared';

export function useSerialScale(onWeight: (kg: number) => void) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState('');
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const onWeightRef = useRef(onWeight);

  useEffect(() => {
    onWeightRef.current = onWeight;
  }, [onWeight]);

  const disconnect = useCallback(async () => {
    try {
      await readerRef.current?.cancel();
      await portRef.current?.close();
    } catch {
      // ignore close errors
    }
    readerRef.current = null;
    portRef.current = null;
    setConnected(false);
  }, []);

  const readLoop = useCallback(async (port: SerialPort) => {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        setLastLine(line);
        const weight = parseScaleWeightLine(line);
        if (weight != null) onWeightRef.current(weight);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!('serial' in navigator)) {
      setError('Tu navegador no soporta Web Serial. Usa Chrome o Edge en escritorio.');
      return;
    }

    try {
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setConnected(true);
      void readLoop(port);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar la báscula');
      await disconnect();
    }
  }, [disconnect, readLoop]);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return { connected, error, lastLine, connect, disconnect };
}
