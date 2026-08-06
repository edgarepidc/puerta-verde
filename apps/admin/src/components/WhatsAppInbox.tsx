'use client';

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
  return (
    <section className="pv-glass-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">WhatsApp</h2>
          <p className="text-sm text-slate-500">
            Mensajes entrantes y respuestas automáticas recientes.
          </p>
        </div>
      </div>

      {initialMessages.length === 0 ? (
        <p className="pv-callout p-4 text-sm">Aún no hay mensajes registrados.</p>
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
                  {message.template_key && (
                    <>
                      <span>·</span>
                      <span>{message.template_key}</span>
                    </>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{message.body}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
