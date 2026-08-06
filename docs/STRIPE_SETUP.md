# Configuración Stripe

## 1. Crear cuenta y productos

1. Crea cuenta en [stripe.com](https://stripe.com)
2. En **Productos**, crea dos precios recurrentes mensuales en MXN:
   - **Básico** → copia el Price ID a `STRIPE_PRICE_BASIC_MONTHLY`
   - **Pro** → copia el Price ID a `STRIPE_PRICE_PRO_MONTHLY`

## 2. Variables de entorno

### `puerta-verde-admin` (Vercel)

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
NEXT_PUBLIC_ADMIN_URL=https://puerta-verde-admin.vercel.app
```

### `puerta-verde-web` (Vercel)

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://puerta-verde-web.vercel.app
```

Usa las claves de **test** (`sk_test_`, `whsec_`) en desarrollo.

## 3. Webhook de Stripe

En Stripe Dashboard → **Developers → Webhooks**:

- **URL:** `https://puerta-verde-web.vercel.app/api/webhooks/stripe`
- **Eventos:**
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copia el **Signing secret** a `STRIPE_WEBHOOK_SECRET`.

## 4. Qué habilita cada flujo

| Flujo | Dónde | Qué hace |
|-------|-------|----------|
| Suscripción SaaS | Admin → Configuración | Cobra plan mensual, actualiza `subscription_status` |
| Portal de facturación | Configuración → Stripe | Cambiar tarjeta, cancelar plan |
| Pago de pedido en línea | Tienda → checkout | Stripe Checkout por pedido individual |
| Webhook | Automático | Marca pedidos pagados y sincroniza suscripciones |

## 5. Probar en local

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

Usa la tarjeta de prueba `4242 4242 4242 4242`.

## 6. TPV físico

El botón **TPV** en pedidos registra cobros manuales en terminal física (Clip, Mercado Pago Point, etc.).

Para integración directa con hardware, el siguiente paso sería conectar el SDK del proveedor que uses y reflejar el cobro en el mismo endpoint `/api/orders/payment`.
