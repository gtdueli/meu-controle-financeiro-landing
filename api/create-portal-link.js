import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Configura os cabeçalhos de CORS para permitir requisições externas/frontend
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde imediatamente à requisição de verificação (preflight) do navegador
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, customerId } = req.body;

  try {
    let stripeCustomerId = customerId;

    if (!stripeCustomerId && email) {
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('email', email)
        .single();

      if (error || !data?.stripe_customer_id) {
        return res.status(404).json({ error: 'Nenhuma assinatura encontrada para este e-mail.' });
      }

      stripeCustomerId = data.stripe_customer_id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'Cliente não identificado.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://meucontrolefinanceirofacil.vercel.app',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}