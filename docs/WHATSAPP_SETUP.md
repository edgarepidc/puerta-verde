# Configuración WhatsApp (Meta Cloud API)

## 1. Crear app en Meta for Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una app tipo **Business**
3. Agrega el producto **WhatsApp**

## 2. Obtener credenciales

- **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- **Access Token** (temporal o permanente) → `WHATSAPP_ACCESS_TOKEN`
- **Verify Token** (tú lo defines) → `WHATSAPP_VERIFY_TOKEN`

## 3. Configurar webhook

URL (producción):

```
https://tu-dominio.com/api/webhooks/whatsapp
```

Eventos: `messages` (fase 2 para pedidos entrantes).

Verificación GET: el endpoint responde el `hub.challenge` si el token coincide.

## 4. Variables de entorno

En `apps/web/.env.local` y `apps/admin/.env.local`:

```env
WHATSAPP_ACCESS_TOKEN=tu_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=puerta-verde-dev
```

## 5. Mensajes automáticos (MVP)

| Evento | Función |
|--------|---------|
| Pedido creado | `buildOrderConfirmationMessage` |
| Cambio de estado | `buildOrderStatusMessage` |

Los envíos se registran en `whatsapp_message_logs`.

## 6. Producción

- Usa token permanente del System User en Business Manager.
- Cada tenant (organización) podrá conectar su propio número vía `whatsapp_configs`.
- Para broadcast de promos, necesitarás plantillas aprobadas por Meta.
