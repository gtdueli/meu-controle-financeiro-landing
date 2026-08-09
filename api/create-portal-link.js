import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Inicializa o Supabase com a chave de serviço (service_role) para ignorar o RLS no servidor
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, customerId } = req.body;

  try {
    let stripeCustomerId = customerId;

    // Se passou o e-mail em vez do ID diretamente, busca na tabela subscriptions com segurança total
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
      return_url: 'https://meucontrolefinanceirofacil.vercel.app', // Ajuste para sua URL de retorno
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}