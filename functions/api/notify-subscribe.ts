// Cloudflare Pages Function
// Se ejecuta en: https://<tu-proyecto>.pages.dev/api/notify-subscribe
// Maneja el formulario "avísame" (restock de ropa / próximos productos)

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  FROM_EMAIL: string;   // ej: "No sabo kids <avisos@nosabokids.store>"
  NOTIFY_EMAIL: string; // tu correo, donde querés recibir el aviso
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendEmail(env: Env, to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error (${res.status}): ${errText}`);
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS: permite que tu tienda en GitHub Pages llame a esta función
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json<{ email?: string }>();
    const email = (body.email || '').trim().toLowerCase();

    // MODO DIAGNÓSTICO TEMPORAL: escribí "debug" como correo para ver qué variables están disponibles
    if (email === 'debug') {
      return new Response(JSON.stringify({ ok: false, error: 'DEBUG keys: ' + JSON.stringify(Object.keys(env)) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ ok: false, error: 'Correo inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Guardar en D1
    await env.DB.prepare('INSERT INTO subscribers (email) VALUES (?)').bind(email).run();

    // Correo de confirmación al cliente
    await sendEmail(
      env,
      email,
      '¡Listo! Te avisaremos — No sabo kids',
      `<p>Gracias por suscribirte. Te vamos a avisar apenas lancemos ropa y nuevos productos de <strong>No sabo kids</strong>.</p>`
    );

    // Aviso a vos
    await sendEmail(
      env,
      env.NOTIFY_EMAIL,
      'Nueva suscripción — No sabo kids',
      `<p>Nuevo correo suscrito para avisos de restock/lanzamientos: <strong>${email}</strong></p>`
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
