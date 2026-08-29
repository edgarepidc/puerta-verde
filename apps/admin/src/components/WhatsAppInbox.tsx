'use client';

import { useState } from 'react';

import { FoldableSummary } from '@/components/ActionChip';

interface WhatsAppLogRow {
  id: string;
  direction: 'inbound' | 'outbound';
  recipient_phone: string;
  template_key: string | null;
  body: string;
  status: string;
  created_at: string;
}

export function WhatsAppInbox({ initialMessages }: { initialMessages: WhatsAppLogRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <FoldableSummary
        title="WhatsApp"
        hint="Mensajes enviados y respuestas automáticas recientes"
        emoji="💬"
        iconClass="bg-emerald-100"
      />

      {initialMessages.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay mensajes registrados.</p>
      ) : (
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {initialMessages.map((message) => {
            const inbound = message.direction === 'inbound';
            return (
              <article
                key={message.id}
                className={`rounded-2xl p-4 text-sm ${
                  inbound ? 'pv-glass-item mr-8' : 'pv-callout ml-8'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {inbound ? 'Cliente' : 'Puerta Verde'}
                  </span>
                  <span>·</span>
                  <span>{message.recipient_phone}</span>
                  <span>·</span>
                  <span>{new Date(message.created_at).toLocaleString('es-MX')}</span>
                  {message.template_key ? (
                    <>
                      <span>·</span>
                      <span>{message.template_key}</span>
                    </>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{message.body}</p>
              </article>
            );
          })}
        </div>
      )}
    </details>
  );
}
