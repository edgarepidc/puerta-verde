import {
  encodeEscPos,
  encodeEscPosShoppingList,
  encodeEscPosTest,
  type ShoppingListTicketData,
  type ThermalReceiptData,
} from '@/lib/thermal-ticket';

export type ThermalPrinterStatus = 'unsupported' | 'disconnected' | 'connecting' | 'ready';
export type ThermalPrinterKind = 'ble' | 'usb' | 'serial';

type SerialWriter = {
  ready: Promise<void>;
  write: (data: Uint8Array) => Promise<void>;
  releaseLock: () => void;
};

type SerialPortLike = {
  readable: { locked?: boolean; getReader: () => { read: () => Promise<{ done: boolean }>; releaseLock: () => void } } | null;
  writable: { locked?: boolean; getWriter: () => SerialWriter } | null;
  open: (options: {
    baudRate: number;
    bufferSize?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }) => Promise<void>;
  close: () => Promise<void>;
  setSignals?: (signals: { dataTerminalReady?: boolean; requestToSend?: boolean }) => Promise<void>;
  addEventListener: (type: 'disconnect', listener: () => void) => void;
};

type UsbDeviceLike = {
  opened: boolean;
  configuration: {
    interfaces: Array<{
      interfaceNumber: number;
      claimed: boolean;
      alternates: Array<{
        endpoints: Array<{
          direction: 'in' | 'out';
          type: string;
          endpointNumber: number;
          packetSize: number;
        }>;
      }>;
    }>;
  } | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>;
};

type BleCharacteristic = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};

type BleDevice = {
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryService: (uuid: string) => Promise<{ getCharacteristics: () => Promise<BleCharacteristic[]> }>;
      getPrimaryServices: () => Promise<Array<{ getCharacteristics: () => Promise<BleCharacteristic[]> }>>;
    }>;
    disconnect: () => void;
  } | null;
  addEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
};

type Handle =
  | { kind: 'ble'; device: BleDevice; characteristic: BleCharacteristic }
  | { kind: 'serial'; port: SerialPortLike }
  | { kind: 'usb'; device: UsbDeviceLike; endpointNumber: number; packetSize: number };

const BAUD_RATES = [9600, 115200, 19200, 38400];
const SERIAL_CHUNK = 64;
const BLE_CHUNK = 20;
const WRITE_TIMEOUT_MS = 8000;

const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff12-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000bebf-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ac-4401-b5f5-6eb3e214570d',
];

const PRINTER_NOT_REACHABLE =
  'La impresora no respondió. Enciéndela, acércala a la PC y pulsa USB si va por cable. Si es Bluetooth, pulsa Bluetooth y elige la térmica en la ventana de Chrome (no aparece en el Bluetooth de Windows).';

export function isWindowsPc() {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

export function describePrinterError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No se eligió ninguna impresora.';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    (error instanceof DOMException && error.name === 'NetworkError') ||
    /connection attempt failed|connection error|gatt server is disconnected|cannot perform gatt|not connected|unknown device|bluetooth adapter not available/i.test(
      message,
    )
  ) {
    return PRINTER_NOT_REACHABLE;
  }
  if (/user cancelled|user canceled|chooser/i.test(message)) {
    return 'No se eligió ninguna impresora.';
  }
  return message.trim() || 'No se pudo conectar la impresora.';
}

let handle: Handle | null = null;
let status: ThermalPrinterStatus = 'disconnected';
let lastError: string | null = null;
let lastInfo: string | null = null;
const listeners = new Set<() => void>();
let writeChain: Promise<unknown> = Promise.resolve();
let connectTask: Promise<void> | null = null;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withPrinterLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function serialNav() {
  if (typeof navigator === 'undefined') return undefined;
  return (
    navigator as unknown as {
      serial?: {
        requestPort: () => Promise<SerialPortLike>;
        getPorts: () => Promise<SerialPortLike[]>;
      };
    }
  ).serial;
}

function usbNav() {
  if (typeof navigator === 'undefined') return undefined;
  return (
    navigator as unknown as {
      usb?: {
        requestDevice: (o: { filters: object[] }) => Promise<UsbDeviceLike>;
        getDevices: () => Promise<UsbDeviceLike[]>;
        addEventListener?: (type: 'disconnect', listener: (event: { device: UsbDeviceLike }) => void) => void;
      };
    }
  ).usb;
}

function bluetoothNav() {
  if (typeof navigator === 'undefined') return undefined;
  return (
    navigator as unknown as {
      bluetooth?: {
        requestDevice: (options: object) => Promise<BleDevice>;
        getDevices?: () => Promise<BleDevice[]>;
      };
    }
  ).bluetooth;
}

function listenIfPossible(target: unknown, type: string, listener: () => void) {
  const candidate = target as { addEventListener?: (eventType: string, cb: () => void) => void } | null;
  if (candidate && typeof candidate.addEventListener === 'function') {
    candidate.addEventListener(type, listener);
  }
}

function listenUsbDisconnect(device: UsbDeviceLike) {
  usbNav()?.addEventListener?.('disconnect', (event) => {
    if (handle?.kind === 'usb' && handle.device === event.device) {
      handle = null;
      setStatus('disconnected', 'La impresora se desconectó.', null);
    }
  });
}

function notify() {
  for (const listener of listeners) listener();
}

function setStatus(next: ThermalPrinterStatus, error?: string | null, info?: string | null) {
  status = next;
  if (error !== undefined) lastError = error;
  if (info !== undefined) lastInfo = info;
  notify();
}

export function isThermalPrinterSupported() {
  return Boolean(serialNav() || usbNav() || bluetoothNav());
}

export function getThermalPrinterStatus() {
  if (typeof navigator === 'undefined') return 'disconnected' as const;
  if (!isThermalPrinterSupported()) return 'unsupported' as const;
  return status === 'unsupported' ? 'disconnected' : status;
}

export function getThermalPrinterError() {
  return lastError;
}

export function getThermalPrinterInfo() {
  return lastInfo;
}

export function getThermalPrinterKind(): ThermalPrinterKind | null {
  return handle?.kind ?? null;
}

export function subscribeThermalPrinter(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isHandleLive() {
  if (!handle) return false;
  if (handle.kind === 'serial') return Boolean(handle.port.writable);
  if (handle.kind === 'usb') return handle.device.opened;
  return Boolean(handle.device.gatt?.connected);
}

function connectionLabel() {
  if (!handle) return '';
  if (handle.kind === 'ble') return 'Bluetooth';
  if (handle.kind === 'usb') return 'USB';
  return 'COM';
}

function pumpReadable(port: SerialPortLike) {
  const readable = port.readable;
  if (!readable || readable.locked) return;
  const reader = readable.getReader();
  void (async () => {
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // disconnect
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }
  })();
}

async function openPort(port: SerialPortLike) {
  let last: unknown;
  for (const baudRate of BAUD_RATES) {
    try {
      await port.open({
        baudRate,
        bufferSize: 4096,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('No se pudo abrir el puerto de la impresora.');
}

async function closeHandle() {
  const current = handle;
  handle = null;
  if (!current) return;
  try {
    if (current.kind === 'serial') await current.port.close();
    else if (current.kind === 'usb' && current.device.opened) await current.device.close();
    else if (current.kind === 'ble' && current.device.gatt?.connected) current.device.gatt.disconnect();
  } catch {
    // already closed
  }
}

async function writeSerial(port: SerialPortLike, data: Uint8Array) {
  if (!port.writable) throw new Error('El puerto COM no está listo. Pulsa COM o USB.');
  if (port.writable.locked) {
    throw new Error('La impresora está ocupada. Espera un segundo y vuelve a intentar.');
  }
  const writer = port.writable.getWriter();
  try {
    for (let offset = 0; offset < data.length; offset += SERIAL_CHUNK) {
      const chunk = data.subarray(offset, offset + SERIAL_CHUNK);
      await withTimeout(
        writer.ready.then(() => writer.write(chunk)),
        WRITE_TIMEOUT_MS,
        'El puerto COM no responde. Prueba USB o Bluetooth.',
      );
    }
    await withTimeout(writer.ready, WRITE_TIMEOUT_MS, 'La impresora no terminó de recibir el ticket.');
  } finally {
    writer.releaseLock();
  }
}

function toBufferSource(chunk: Uint8Array): ArrayBuffer {
  return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
}

function isGattDisconnectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /GATT Server is disconnected|Cannot perform GATT operations|GATT operation already in progress|not connected|NetworkError/i.test(
    message,
  );
}

async function writeBleChunk(characteristic: BleCharacteristic, chunk: Uint8Array) {
  const payload = toBufferSource(chunk);
  const canWriteWithoutResponse =
    characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse;
  try {
    const write = canWriteWithoutResponse
      ? characteristic.writeValueWithoutResponse!(payload)
      : characteristic.writeValue(payload);
    await withTimeout(write, WRITE_TIMEOUT_MS, 'Bluetooth no responde. Acerca la impresora y vuelve a conectar.');
  } catch (error) {
    if (!canWriteWithoutResponse || !isGattDisconnectError(error)) throw error;
    await withTimeout(
      characteristic.writeValue(payload),
      WRITE_TIMEOUT_MS,
      'Bluetooth no responde. Acerca la impresora y vuelve a conectar.',
    );
  }
}

async function writeBle(characteristic: BleCharacteristic, data: Uint8Array) {
  for (let offset = 0; offset < data.length; offset += BLE_CHUNK) {
    const chunk = data.slice(offset, offset + BLE_CHUNK);
    await writeBleChunk(characteristic, chunk);
    await delay(30);
  }
}

async function reconnectBle(device: BleDevice) {
  try {
    if (device.gatt?.connected) device.gatt.disconnect();
  } catch {
    // already down
  }
  handle = null;
  await delay(400);
  await openBle(device);
}

async function writeBleReliable(data: Uint8Array) {
  const device = handle?.kind === 'ble' ? handle.device : null;
  if (!device) {
    throw new Error('La impresora no está conectada. Pulsa Bluetooth, USB o COM.');
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (handle?.kind !== 'ble' || handle.device !== device || !device.gatt?.connected) {
        await reconnectBle(device);
      }
      if (handle?.kind !== 'ble' || handle.device !== device) {
        throw new Error('La impresora no está conectada. Pulsa Bluetooth, USB o COM.');
      }
      await writeBle(handle.characteristic, data);
      return;
    } catch (error) {
      lastError = error;
      if (!isGattDisconnectError(error) && attempt > 0) throw error;
      await reconnectBle(device);
    }
  }
  throw lastError instanceof Error && isGattDisconnectError(lastError)
    ? new Error('Se perdió el Bluetooth. Pulsa Bluetooth y vuelve a imprimir.')
    : lastError instanceof Error
      ? lastError
      : new Error('Se perdió el Bluetooth. Pulsa Bluetooth y vuelve a imprimir.');
}

async function writeBytes(data: Uint8Array) {
  if (handle?.kind === 'ble') {
    await writeBleReliable(data);
    return;
  }
  if (!handle || !isHandleLive()) {
    handle = null;
    throw new Error('La impresora no está conectada. Pulsa Bluetooth, USB o COM.');
  }
  if (handle.kind === 'serial') {
    await writeSerial(handle.port, data);
    return;
  }

  const chunk = Math.max(handle.packetSize || 64, 64);
  for (let offset = 0; offset < data.length; offset += chunk) {
    await handle.device.transferOut(handle.endpointNumber, data.slice(offset, offset + chunk));
  }
}

async function findWritableCharacteristic(
  service: { getCharacteristics: () => Promise<BleCharacteristic[]> },
) {
  const characteristics = await service.getCharacteristics();
  return (
    characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write) ?? null
  );
}

async function connectGatt(device: BleDevice, attempts = 3) {
  if (!device.gatt) {
    throw new Error('Este dispositivo Bluetooth no se puede usar para imprimir desde Chrome.');
  }
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // Chrome can keep gatt.connected=true after the printer dropped GATT.
      if (device.gatt.connected) {
        try {
          device.gatt.disconnect();
        } catch {
          // already down
        }
        await delay(700);
      }
      return await withTimeout(
        device.gatt.connect(),
        WRITE_TIMEOUT_MS,
        'Bluetooth no responde al conectar. Acerca la impresora y vuelve a intentar.',
      );
    } catch (error) {
      last = error;
      await delay(500 * (attempt + 1));
    }
  }
  throw new Error(describePrinterError(last));
}

async function openBle(device: BleDevice) {
  const server = await connectGatt(device);
  await delay(250);
  let characteristic: BleCharacteristic | null = null;

  for (const uuid of BLE_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      characteristic = await findWritableCharacteristic(service);
      if (characteristic) break;
    } catch {
      // service not present
    }
  }

  if (!characteristic) {
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        characteristic = await findWritableCharacteristic(service);
        if (characteristic) break;
      }
    } catch {
      // Web Bluetooth blocks unknown services
    }
  }

  if (!characteristic) {
    throw new Error(
      'Bluetooth conectó, pero no hay canal de impresión. Prueba con el cable USB o acerca más la impresora.',
    );
  }

  listenIfPossible(device, 'gattserverdisconnected', () => {
    if (handle?.kind === 'ble' && handle.device === device) {
      handle = null;
      setStatus('disconnected', 'Se perdió el Bluetooth. Pulsa Bluetooth.', null);
    }
  });
  handle = { kind: 'ble', device, characteristic };
  setStatus('ready', null, `Conectada por Bluetooth${device.name ? ` (${device.name})` : ''}.`);
}

async function openSerial(port: SerialPortLike) {
  if (!port.writable) {
    await openPort(port);
  }
  if (!port.writable) {
    throw new Error('El puerto serie no está listo.');
  }
  try {
    await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
  } catch {
    // some adapters reject signals
  }
  pumpReadable(port);
  listenIfPossible(port, 'disconnect', () => {
    if (handle?.kind === 'serial' && handle.port === port) {
      handle = null;
      setStatus('disconnected', 'La impresora se desconectó.', null);
    }
  });
  handle = { kind: 'serial', port };
  setStatus(
    'ready',
    null,
    'Puerto COM abierto. Si no imprime, prueba USB o Bluetooth.',
  );
}

async function openUsb(device: UsbDeviceLike) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  let endpointNumber: number | null = null;
  let packetSize = 64;
  let interfaceNumber: number | null = null;

  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      const endpoint = alt.endpoints.find((item) => item.direction === 'out' && item.type === 'bulk');
      if (!endpoint) continue;
      try {
        if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
        endpointNumber = endpoint.endpointNumber;
        packetSize = endpoint.packetSize || 64;
        interfaceNumber = iface.interfaceNumber;
        break;
      } catch {
        // try next interface
      }
    }
    if (endpointNumber != null) break;
  }

  if (endpointNumber == null || interfaceNumber == null) {
    throw new Error(
      'Windows está usando el USB. Cierra otros programas de la impresora y vuelve a pulsar USB, o usa Bluetooth / COM.',
    );
  }

  listenUsbDisconnect(device);
  handle = { kind: 'usb', device, endpointNumber, packetSize };
  setStatus('ready', null, 'Conectada por USB.');
}

export async function reconnectThermalPrinter() {
  if (connectTask) return connectTask;
  connectTask = (async () => {
    if (isHandleLive()) {
      setStatus('ready', lastError, lastInfo);
      return;
    }
    handle = null;
    if (!isThermalPrinterSupported()) {
      setStatus('unsupported', 'Usa Chrome o Edge. Safari no puede hablar directo con la térmica.');
      return;
    }

    try {
      // Do not auto-connect Bluetooth: a failed GATT attempt (Windows already
      // holding BlueTooth Printer) often blocks the next click.
      const usb = usbNav();
      if (usb) {
        const devices = await usb.getDevices();
        if (devices[0]) {
          setStatus('connecting', null, null);
          await openUsb(devices[0]);
          return;
        }
      }

      const serial = serialNav();
      if (serial) {
        const ports = await serial.getPorts();
        if (ports[0]) {
          setStatus('connecting', null, null);
          await openSerial(ports[0]);
          return;
        }
      }

      setStatus('disconnected', null, null);
    } catch (error) {
      await closeHandle();
      setStatus('disconnected', describePrinterError(error), null);
    }
  })().finally(() => {
    connectTask = null;
  });
  return connectTask;
}

export async function connectThermalPrinter(kind: ThermalPrinterKind) {
  if (kind === 'ble' && !bluetoothNav()) {
    throw new Error('Este navegador no permite Bluetooth. Usa Chrome o Edge.');
  }
  if (kind === 'serial' && !serialNav()) {
    throw new Error('Este navegador no permite puerto serie. Usa Chrome o Edge.');
  }
  if (kind === 'usb' && !usbNav()) {
    throw new Error('Este navegador no permite USB directo. Usa Chrome o Edge.');
  }

  setStatus('connecting', null, null);
  try {
    await closeHandle();
    if (kind === 'ble') {
      const bluetooth = bluetoothNav()!;
      const device = await bluetooth.requestDevice(
        isWindowsPc()
          ? { acceptAllDevices: true, optionalServices: BLE_SERVICES }
          : {
              filters: [
                { namePrefix: 'BlueTooth' },
                { namePrefix: 'Bluetooth' },
                { namePrefix: 'Printer' },
                { namePrefix: 'POS' },
                { namePrefix: 'MTP' },
                { namePrefix: 'BT' },
                { namePrefix: 'XP' },
                { namePrefix: 'RPP' },
                { namePrefix: 'Gprinter' },
              ],
              optionalServices: BLE_SERVICES,
            },
      );
      await openBle(device);
      return;
    }
    if (kind === 'serial') {
      const port = await serialNav()!.requestPort();
      await openSerial(port);
      return;
    }
    const device = await usbNav()!.requestDevice({ filters: [] });
    await openUsb(device);
  } catch (error) {
    const message = describePrinterError(error);
    await closeHandle();
    setStatus('disconnected', message, null);
    throw new Error(message);
  }
}

function isChooserCancel(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'NotFoundError') ||
    /no se eligió/i.test(describePrinterError(error))
  );
}

async function tryConnectKind(kind: ThermalPrinterKind) {
  try {
    await connectThermalPrinter(kind);
    return isHandleLive();
  } catch (error) {
    if (isChooserCancel(error)) return false;
    throw error;
  }
}

async function tryRememberedBle() {
  // Windows often keeps a permission without the printer advertising, then GATT fails.
  if (isWindowsPc()) return;
  const bluetooth = bluetoothNav();
  if (!bluetooth?.getDevices) return;
  try {
    const devices = await bluetooth.getDevices();
    const remembered = devices.find((device) => device.gatt);
    if (!remembered) return;
    setStatus('connecting', null, null);
    await openBle(remembered);
  } catch {
    await closeHandle();
    setStatus('disconnected', null, null);
  }
}

async function ensureConnected(connectIfNeeded: boolean) {
  if (!isHandleLive()) {
    handle = null;
    await reconnectThermalPrinter();
  }
  if (!isHandleLive() && connectIfNeeded) {
    await tryRememberedBle();
  }
  if (!isHandleLive() && connectIfNeeded) {
    await connectThermalPrinter('ble');
  }
  if (!isHandleLive()) {
    throw new Error(
      'Pulsa USB (cable) o Bluetooth. La térmica no se conecta desde el Bluetooth de Windows: elígela en la ventana de Chrome.',
    );
  }
}

export async function printThermalReceipt(
  data: ThermalReceiptData,
  options?: { connectIfNeeded?: boolean },
) {
  return withPrinterLock(async () => {
    if (!isHandleLive()) {
      handle = null;
      await reconnectThermalPrinter();
    }
    if (!isHandleLive() && options?.connectIfNeeded) {
      if (isWindowsPc()) {
        await tryConnectKind('usb');
      } else {
        await ensureConnected(true);
      }
    }
    if (isHandleLive()) {
      await writeBytes(await encodeEscPos(data));
      setStatus('ready', null, `Ticket enviado por ${connectionLabel()}.`);
      return;
    }
    throw new Error('Pulsa USB (cable) o Bluetooth y elige la térmica en Chrome.');
  });
}

export async function printThermalShoppingList(
  data: ShoppingListTicketData,
  options?: { connectIfNeeded?: boolean },
) {
  return withPrinterLock(async () => {
    await ensureConnected(Boolean(options?.connectIfNeeded));
    await writeBytes(await encodeEscPosShoppingList(data));
    setStatus('ready', null, `Lista de compra enviada por ${connectionLabel()}.`);
  });
}

export async function printThermalTest(options?: { connectIfNeeded?: boolean }) {
  return withPrinterLock(async () => {
    await ensureConnected(Boolean(options?.connectIfNeeded));
    await writeBytes(encodeEscPosTest());
    const note =
      handle?.kind === 'serial'
        ? 'Se envió al puerto COM. Si no salió papel, prueba USB o Bluetooth.'
        : `Prueba enviada por ${connectionLabel()}.`;
    setStatus('ready', null, note);
  });
}
