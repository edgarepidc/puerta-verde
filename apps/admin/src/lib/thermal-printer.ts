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
  return 'puerto serie del Mac';
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
  if (!port.writable) throw new Error('El puerto serie no está listo. Pulsa Conectar Bluetooth.');
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
        'El puerto serie del Mac no entrega datos. Usa Conectar Bluetooth y elige la impresora, no cu.BlueToothPrinter.',
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
    throw new Error('La impresora no está conectada. Pulsa Conectar Bluetooth.');
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (handle?.kind !== 'ble' || handle.device !== device || !device.gatt?.connected) {
        await reconnectBle(device);
      }
      if (handle?.kind !== 'ble' || handle.device !== device) {
        throw new Error('La impresora no está conectada. Pulsa Conectar Bluetooth.');
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
    ? new Error('Se perdió el Bluetooth. Pulsa Conectar Bluetooth y vuelve a imprimir.')
    : lastError instanceof Error
      ? lastError
      : new Error('Se perdió el Bluetooth. Pulsa Conectar Bluetooth y vuelve a imprimir.');
}

async function writeBytes(data: Uint8Array) {
  if (handle?.kind === 'ble') {
    await writeBleReliable(data);
    return;
  }
  if (!handle || !isHandleLive()) {
    handle = null;
    throw new Error('La impresora no está conectada. Pulsa Conectar Bluetooth.');
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

async function openBle(device: BleDevice) {
  if (!device.gatt) {
    throw new Error('Este dispositivo Bluetooth no se puede usar para imprimir desde Chrome.');
  }
  // Chrome can keep gatt.connected=true after the printer dropped GATT.
  // Disconnect first so we always get a fresh characteristic.
  if (device.gatt.connected) {
    try {
      device.gatt.disconnect();
    } catch {
      // already down
    }
    await delay(400);
  }
  const server = await withTimeout(
    device.gatt.connect(),
    WRITE_TIMEOUT_MS,
    'Bluetooth no responde al conectar. Acerca la impresora y vuelve a intentar.',
  );
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
      setStatus('disconnected', 'Se perdió el Bluetooth. Pulsa Conectar Bluetooth.', null);
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
    'Puerto serie del Mac abierto. Si no imprime, usa Conectar Bluetooth: cu.BlueToothPrinter casi nunca llega a la térmica.',
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
      'El Mac está usando la impresora. Quítala de Ajustes → Impresoras y conéctala por Bluetooth o USB aquí.',
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
      const bluetooth = bluetoothNav();
      if (bluetooth?.getDevices) {
        const devices = await bluetooth.getDevices();
        const remembered = devices.find((device) => device.gatt);
        if (remembered) {
          setStatus('connecting', null, null);
          await openBle(remembered);
          return;
        }
      }

      const usb = usbNav();
      if (usb) {
        const devices = await usb.getDevices();
        if (devices[0]) {
          setStatus('connecting', null, null);
          await openUsb(devices[0]);
          return;
        }
      }

      setStatus('disconnected', null, null);
    } catch (error) {
      await closeHandle();
      setStatus(
        'disconnected',
        error instanceof Error ? error.message : 'No se pudo reconectar la impresora.',
        null,
      );
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
      const device = await bluetooth.requestDevice({
        filters: [
          { namePrefix: 'BlueTooth' },
          { namePrefix: 'Bluetooth' },
          { namePrefix: 'Printer' },
          { namePrefix: 'POS' },
          { namePrefix: 'MTP' },
          { namePrefix: 'BT' },
          { namePrefix: 'XP' },
        ],
        optionalServices: BLE_SERVICES,
      });
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
    const message =
      error instanceof DOMException && error.name === 'NotFoundError'
        ? 'No se eligió ninguna impresora.'
        : error instanceof Error
          ? error.message
          : 'No se pudo conectar la impresora.';
    await closeHandle();
    setStatus('disconnected', message, null);
    throw new Error(message);
  }
}

async function ensureConnected(connectIfNeeded: boolean) {
  if (!isHandleLive()) {
    handle = null;
    await reconnectThermalPrinter();
  }
  if (!isHandleLive() && connectIfNeeded) {
    await connectThermalPrinter('ble');
  }
  if (!isHandleLive()) {
    throw new Error('Pulsa Conectar Bluetooth y elige la impresora (no el puerto cu.).');
  }
}

export async function printThermalReceipt(
  data: ThermalReceiptData,
  options?: { connectIfNeeded?: boolean },
) {
  return withPrinterLock(async () => {
    await ensureConnected(Boolean(options?.connectIfNeeded));
    await writeBytes(await encodeEscPos(data));
    setStatus('ready', null, `Ticket enviado por ${connectionLabel()}.`);
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
        ? 'Se envió al puerto serie del Mac. Si no salió papel, ese puerto no llega a la térmica: usa Conectar Bluetooth.'
        : `Prueba enviada por ${connectionLabel()}.`;
    setStatus('ready', null, note);
  });
}
