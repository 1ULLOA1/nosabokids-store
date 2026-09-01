type Env = {
  STRIPE_SECRET_KEY?: string;
};

type FunctionContext = {
  request: Request;
  env: Env;
};

const ALLOWED_ORIGINS = new Set([
  'https://nosabokids.store',
  'https://www.nosabokids.store',
  'https://nosabokids-store.pages.dev',
]);

const PRODUCT_NAME = 'NO SABO KIDS Cozy Slides — Negro';
const UNIT_AMOUNT_CENTS = 5999;
const MAX_QUANTITY = 10;

function responseHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');
  const endpointOrigin = new URL(request.url).origin;
  const allowedOrigin =
    requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : endpointOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

function getStoreOrigin(request: Request): string {
  const requestOrigin = request.headers.get('Origin');

  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    return requestOrigin;
  }

  return new URL(request.url).origin;
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request),
    });
  }

  if (request.method !== 'POST') {
    return json(request, { error: 'Método no permitido. Usa POST.' }, 405);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json(
      request,
      { error: 'STRIPE_SECRET_KEY no está configurada en Cloudflare.' },
      500,
    );
  }

  try {
    const body = (await request.json()) as {
      items?: Array<{ id?: unknown; qty?: unknown }>;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json(request, { error: 'El carrito está vacío.' }, 400);
    }

    let quantity = 0;

    for (const item of body.items) {
      const id = typeof item?.id === 'string' ? item.id : '';
      const itemQuantity = Number(item?.qty);

      if (!id.startsWith('cozy-slides-')) {
        return json(request, { error: 'El carrito contiene un producto inválido.' }, 400);
      }

      if (!Number.isInteger(itemQuantity) || itemQuantity < 1) {
        return json(request, { error: 'La cantidad del producto no es válida.' }, 400);
      }

      quantity += itemQuantity;
    }

    if (quantity > MAX_QUANTITY) {
      return json(
        request,
        { error: `Solo puedes comprar hasta ${MAX_QUANTITY} pares por pedido.` },
        400,
      );
    }

    const storeOrigin = getStoreOrigin(request);
    const stripeForm = new URLSearchParams();

    stripeForm.set('mode', 'payment');
    stripeForm.set('success_url', `${storeOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    stripeForm.set('cancel_url', `${storeOrigin}/?checkout=cancelled`);
    stripeForm.set('locale', 'auto');
    stripeForm.set('shipping_address_collection[allowed_countries][0]', 'US');
    stripeForm.set('line_items[0][quantity]', String(quantity));
    stripeForm.set('line_items[0][price_data][currency]', 'usd');
    stripeForm.set(
      'line_items[0][price_data][unit_amount]',
      String(UNIT_AMOUNT_CENTS),
    );
    stripeForm.set(
      'line_items[0][price_data][product_data][name]',
      PRODUCT_NAME,
    );
    stripeForm.set('metadata[product]', 'cozy-slides-negro');

    const stripeResponse = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: stripeForm.toString(),
      },
    );

    const stripeData = (await stripeResponse.json()) as {
      url?: string;
      error?: { message?: string };
    };

    if (!stripeResponse.ok || !stripeData.url) {
      return json(
        request,
        {
          error:
            stripeData.error?.message ||
            'Stripe no pudo crear la sesión de pago.',
        },
        502,
      );
    }

    return json(request, { url: stripeData.url });
  } catch (error) {
    console.error('create-checkout error:', error);

    return json(
      request,
      { error: 'No se pudo crear la sesión de pago.' },
      500,
    );
  }
}
