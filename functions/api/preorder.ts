// Cloudflare Pages Function
// Se ejecuta en: https://<tu-proyecto>.pages.dev/api/preorder
// Maneja el formulario de preórdenes (colores café / rojo)

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  NOTIFY_EMAIL: string;
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
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error (${res.status}): ${errText}`);
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json<{
      name?: string; email?: string; color?: string; qty?: number;
    }>();

    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const color = (body.color || '').trim();
    const qty = Number(body.qty) > 0 ? Number(body.qty) : 1;

    if (!name || !email || !isValidEmail(email) || !color) {
      return new Response(JSON.stringify({ ok: false, error: 'Datos incompletos o correo inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const total = qty * 59.99;

    await env.DB.prepare(
      'INSERT INTO preorders (name, email, color, qty, total) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, email, color, qty, total).run();

    await sendEmail(
      env,
      email,
      'Confirmación de preorden — No sabo kids',
      `<p>Hola ${name}, tu preorden quedó registrada:</p>
       <ul>
         <li>Color: ${color}</li>
         <li>Cantidad: ${qty}</li>
         <li>Total: $${total.toFixed(2)}</li>
       </ul>
       <p>Te avisaremos apenas esté lista tu preorden.</p>`
    );

    await sendEmail(
      env,
      env.NOTIFY_EMAIL,
      'Nueva preorden — No sabo kids',
      `<p><strong>${name}</strong> (${email}) preordenó ${qty} par(es) color ${color}. Total: $${total.toFixed(2)}</p>`
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
