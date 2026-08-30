import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { restockSubscribers } from "../../db/schema.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let email: unknown;
  try {
    const body = await req.json();
    email = body?.email;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Correo electrónico inválido." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    await db.insert(restockSubscribers).values({ email: normalizedEmail }).onConflictDoNothing();
  } catch (err) {
    console.error("Error saving restock subscriber", err);
    return Response.json({ error: "No se pudo guardar tu correo. Intenta de nuevo." }, { status: 500 });
  }

  return Response.json({ ok: true });
};

export const config: Config = {
  path: "/api/notify-subscribe",
};
