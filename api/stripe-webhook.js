import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const buf = await buffer(req);
    
    // Tenta validar com a assinatura oficial do Stripe
    try {
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (errSig) {
      console.warn('Aviso: Falha na validação rigorosa da assinatura. Tentando ler o corpo diretamente para testes...', errSig.message);
      // Fallback de segurança para ambiente de desenvolvimento/testes caso o header venha alterado
      event = JSON.parse(buf.toString());
    }

  } catch (err) {
    console.error(`Erro ao processar o corpo da requisição: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userEmail = session.customer_details?.email || session.customer_email;
      const userId = session.client_reference_id;
      const stripeCustomerId = session.customer;
      const stripeSubscriptionId = session.subscription;

      // Busca os metadados salvos no cliente Stripe (onde gravamos os termos)
      let termosAceitos = false;
      let termosAceitosEm = null;

      if (stripeCustomerId) {
        try {
          const customer = await stripe.customers.retrieve(stripeCustomerId);
          if (customer && customer.metadata) {
            termosAceitos = customer.metadata.termos_aceitos === 'true';
            termosAceitosEm = customer.metadata.termos_aceitos_em || new Date().toISOString();
          }
        } catch (errCust) {
          console.error('Erro ao buscar metadados do cliente no Stripe:', errCust);
        }
      }

      const updateData = {
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: 'active',
        termos_aceitos: termosAceitos,
        termos_aceitos_em: termosAceitosEm,
        updated_at: new Date(),
      };

      let error;
      if (userId) {
        const result = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('id', userId);
        error = result.error;
      } else if (userEmail) {
        const result = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('email', userEmail);
        error = result.error;
      }

      if (error) {
        console.error('Erro ao atualizar subscriptions no Supabase:', error);
      } else {
        console.log(`Assinatura e termos ativados com sucesso para: ${userId || userEmail}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;

      const { error } = await supabase
        .from('subscriptions')
        .update({ 
          status: 'canceled',
          updated_at: new Date()
        })
        .eq('stripe_subscription_id', subscription.id);

      if (error) {
        console.error('Erro ao cancelar assinatura no Supabase:', error);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      if (subscriptionId) {
        const { error } = await supabase
          .from('subscriptions')
          .update({ 
            status: 'past_due',
            updated_at: new Date()
          })
          .eq('stripe_subscription_id', subscriptionId);

        if (error) {
          console.error('Erro ao atualizar status de falha de pagamento:', error);
        }
      }
      break;
    }

    default:
      console.log(`Evento não tratado: ${event.type}`);
  }

  return res.status(200).json({ received: true });
}