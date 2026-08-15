// 1. (Opcional, mas recomendado) Se você recolher o CPF/Nome no seu front-end:
    const { email, password, userId, plan, name, cpf, address } = req.body;

    // 2. Criar ou buscar o cliente no Stripe com os dados fiscais do Brasil
    const customer = await stripe.customers.create({
      email: email,
      name: name || undefined,
      address: address ? {
        line1: address.street,
        city: address.city,
        state: address.state,
        postal_code: address.zipCode,
        country: 'BR',
      } : undefined,
      tax_id_data: cpf ? [{ type: 'br_cpf', value: cpf }] : undefined,
    });

    // 3. Criar a sessão de checkout vinculada a esse cliente
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
      customer: customer.id, // Vincula diretamente ao cliente criado com CPF/Endereço
      
      success_url: `${req.headers.origin || 'https://meucontrolefinanceiro.vercel.app'}/?payment=success`,
      cancel_url: `${req.headers.origin || 'https://meucontrolefinanceiro.vercel.app'}/?payment=cancelled`,
    });

    return res.status(200).json({ url: session.url });