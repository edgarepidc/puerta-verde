interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface Serial extends EventTarget {
  requestPort(): Promise<SerialPort>;
}

interface Navigator {
  serial?: Serial;
}
