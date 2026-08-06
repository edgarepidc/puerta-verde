# Configuración WhatsApp (Meta Cloud API)

## 1. Crear app en Meta for Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una app tipo **Business**
3. Agrega el producto **WhatsApp**

## 2. Obtener credenciales

- **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- **Access Token** (temporal o permanente) → `WHATSAPP_ACCESS_TOKEN`
- **Verify Token** (tú lo defines) → `WHATSAPP_VERIFY_TOKEN`
- **App Secret** (recomendado en producción) → `WHATSAPP_APP_SECRET`

## 3. Configurar webhook

URL (producción):

```
https://puerta-verde-web.vercel.app/api/webhooks/whatsapp
```

Eventos: `messages` y `message_status`.

Verificación GET: el endpoint responde el `hub.challenge` si el token coincide.

## 4. Variables de entorno

En `apps/web/.env.local` (y Vercel para producción):

```env
WHATSAPP_ACCESS_TOKEN=tu_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=puerta-verde-dev
WHATSAPP_APP_SECRET=tu_app_secret
WHATSAPP_DEFAULT_ORGANIZATION_ID=a0000000-0000-4000-8000-000000000001
```

Opcional en admin para envíos salientes:

```env
WHATSAPP_ACCESS_TOKEN=tu_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
```

## 5. Mensajes automáticos (salientes)

| Evento | Función |
|--------|---------|
| Pedido creado | `buildOrderConfirmationMessage` |
| Cambio de estado | `buildOrderStatusMessage` |

Los envíos se registran en `whatsapp_message_logs` con `direction = outbound`.

## 6. Mensajes entrantes (clientes)

Cuando un cliente escribe al número de WhatsApp, el webhook responde automáticamente según el texto:

| El cliente escribe | Respuesta |
|--------------------|-----------|
| `AYUDA`, `HOLA`, `MENU` | Menú de comandos + link a la tienda |
| `PEDIDO`, `ESTADO` | Últimos 3 pedidos con estado y link de seguimiento |
| `#1234` o `PEDIDO 1234` | Detalle de ese pedido si coincide con su número |
| `PROMOS`, `OFERTAS` | Promociones activas de la sucursal |
| `TIENDA`, `CATALOGO` | Link directo para hacer pedido |
| `BAJA`, `STOP` | Opt-out de mensajes promocionales |
| `ALTA` | Reactivar promociones |

Reglas:

- Los mensajes entrantes y las respuestas se guardan en `whatsapp_message_logs`.
- Si el cliente está dado de baja (`whatsapp_opt_in = false`), solo recibe respuestas a `ALTA`, `PEDIDO` o consultas de pedido.
- Las actualizaciones de entrega (`delivered`, `read`) actualizan el estado del log saliente.

## 7. Panel admin

En **Configuración** verás el inbox de WhatsApp con los últimos 30 mensajes (entrantes y salientes).

## 8. Producción

- Usa token permanente del System User en Business Manager.
- Configura `WHATSAPP_APP_SECRET` para validar la firma `X-Hub-Signature-256`.
- Cada tenant podrá conectar su propio número vía `whatsapp_configs`.
- Para broadcast masivo de promos, necesitarás plantillas aprobadas por Meta.
