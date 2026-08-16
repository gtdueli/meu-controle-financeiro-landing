import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email, password, userId, plan, name, cpf, address } = req.body;

  try {
    let finalUserId = userId;

    if (!finalUserId && email) {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const foundUser = existingUsers?.users?.find((u) => u.email === email);

      if (foundUser) {
        finalUserId = foundUser.id;
      } else if (password) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) {
          return res.status(400).json({ error: error.message });
        }
        finalUserId = data.user.id;
      }
    }

    if (!finalUserId) {
      return res.status(400).json({ error: 'Dados insuficientes para processar o usuário.' });
    }

    const priceId = plan === 'yearly'
      ? process.env.STRIPE_PRICE_ID_YEARLY
      : process.env.STRIPE_PRICE_ID_MONTHLY;

    if (!priceId) {
      return res.status(400).json({ error: 'ID de preço do Stripe não configurado para este plano.' });
    }

    // Monta o objeto do cliente no Stripe com os dados fiscais e os Metadados
    const customerData = {
      email: email,
      name: name || undefined,
      metadata: {
        nome: name || '',
        cpf: cpf || '',
        street: address?.street || '',
        city: address?.city || '',
        state: address?.state || '',
        zipCode: address?.zipCode || ''
      }
    };

    if (cpf) {
      customerData.tax_id_data = [{ type: 'br_cpf', value: cpf.replace(/\D/g, '') }];
    }

    if (address) {
      customerData.address = {
        line1: address.street,
        city: address.city,
        state: address.state,
        postal_code: address.zipCode?.replace(/\D/g, ''),
        country: 'BR',
      };
    }

    const customer = await stripe.customers.create(customerData);

    // Cria a sessão de pagamento vinculada ao cliente recém-criado
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      client_reference_id: finalUserId,
      customer: customer.id,
      success_url: `${req.headers.origin || 'https://meucontrolefinanceiro.vercel.app'}/?payment=success`,
      cancel_url: `${req.headers.origin || 'https://meucontrolefinanceiro.vercel.app'}/?payment=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erro no create-checkout:', err);
    return res.status(500).json({ error: err.message });
  }
}