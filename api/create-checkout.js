import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email, userId, priceId } = req.body;

  if (!email || !userId) {
    return res.status(400).json({ error: 'E-mail e ID do usuário são obrigatórios.' });
  }

  try {
    // Cria a sessão de checkout no Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      metadata: {
        supabase_user_id: userId, // Vincula o ID do usuário do Supabase para o Webhook
      },
      line_items: [
        {
          // Usa o priceId enviado pelo frontend ou o padrão cadastrado nas suas variáveis
          price: priceId || process.env.STRIPE_PRICE_ID, 
          quantity: 1,
        },
      ],
      mode: 'subscription',
      // Para onde o cliente vai após pagar com sucesso
      success_url: `${req.headers.origin}/login?payment=success`,
      // Para onde o cliente vai se cancelar ou fechar a janela
      cancel_url: `${req.headers.origin}/login?payment=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erro ao criar sessão no Stripe:', err);
    return res.status(500).json({ error: err.message });
  }
}