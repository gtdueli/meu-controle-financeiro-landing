import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  const { customerId } = req.body; 
  
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://seu-dominio.com.br/dashboard', // Altere para a URL correta do seu app
    });
    
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erro ao criar sessão do portal:', err);
    res.status(500).json({ error: err.message });
  }
}