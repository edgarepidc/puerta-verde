'use client';

import { useState } from 'react';

export function PayOnlineButton({ trackingToken }: { trackingToken: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingToken }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo iniciar el pago');
      if (payload.url) window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al pagar');
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={loading} onClick={pay} className="pv-btn-primary w-full px-4 py-3">
        {loading ? 'Redirigiendo a pago seguro...' : 'Pagar en línea con tarjeta'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
