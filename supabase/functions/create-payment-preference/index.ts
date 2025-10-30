import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { orderId, items, totalAmount, restaurantName, clientUrl } = await req.json();
    console.log(`[create-payment-preference] Received request for orderId: ${orderId}`);

    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
      console.error("[create-payment-preference] FATAL: MERCADO_PAGO_ACCESS_TOKEN is not configured in Supabase secrets.");
      // Retorna 400 para o cliente, mas loga o erro 500 no console do servidor
      return new Response(JSON.stringify({ error: "Mercado Pago access token is not configured." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    // Log de diagnóstico: verifica se o token foi carregado (apenas os primeiros 5 caracteres)
    console.log(`[create-payment-preference] Access Token loaded (first 5 chars): ${accessToken.substring(0, 5)}...`);

    if (!clientUrl) {
      console.error("[create-payment-preference] FATAL: Client URL is missing from the request body.");
      throw new Error("Client URL is required for payment redirection.");
    }

    console.log(`[create-payment-preference] Processing ${items.length} items for a total of ${totalAmount}`);

    // Mapeia e valida os itens do carrinho
    const preferenceItems = items.map((item: any) => {
      const unit_price = parseFloat(item.price.toFixed(2));
      if (unit_price <= 0 || !item.quantity || item.quantity <= 0) {
        console.warn(`[create-payment-preference] Filtering out invalid item: ${item.name} (Price: ${item.price}, Qty: ${item.quantity})`);
        return null;
      }
      return {
        title: item.name,
        quantity: item.quantity,
        unit_price: unit_price,
        currency_id: 'BRL',
      };
    }).filter(Boolean); // Remove null (invalid) items

    if (preferenceItems.length === 0) {
      console.error("[create-payment-preference] FATAL: No valid items found after filtering.");
      throw new Response(JSON.stringify({ error: "No valid items to process for payment." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Recalcula o subtotal com base nos itens válidos e calcula a taxa de entrega
    const subtotal = preferenceItems.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);
    const deliveryFee = totalAmount - subtotal;

    // Adiciona a taxa de entrega como um item separado, se for positiva
    if (deliveryFee > 0) {
      preferenceItems.push({
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: parseFloat(deliveryFee.toFixed(2)),
        currency_id: 'BRL',
      });
      console.log(`[create-payment-preference] Added delivery fee of ${deliveryFee.toFixed(2)}`);
    } else if (deliveryFee < 0) {
      console.warn(`[create-payment-preference] Negative delivery fee calculated. Total: ${totalAmount}, Subtotal: ${subtotal}. This may indicate a rounding issue.`);
    }

    // Sanitize restaurant name for statement descriptor
    let sanitizedRestaurantName = restaurantName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9 ]/g, '') // Remove special characters, keep spaces
      .substring(0, 22)
      .trim();
    
    if (!sanitizedRestaurantName) {
      sanitizedRestaurantName = "PEDIDO123"; // Fallback descriptor
    }

    const preference = {
      items: preferenceItems,
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" } // Exclui Boleto
        ],
        installments: 1 // Força pagamento à vista
      },
      back_urls: {
        success: `${clientUrl}/#/order-success/${orderId}?status=approved`,
        failure: `${clientUrl}/#/checkout?status=failure`,
        pending: `${clientUrl}/#/checkout?status=pending`,
      },
      auto_return: 'approved',
      external_reference: orderId,
      statement_descriptor: sanitizedRestaurantName,
    };

    console.log('[create-payment-preference] Creating preference with payload:', JSON.stringify(preference, null, 2));

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      let errorBody;
      try {
        errorBody = JSON.parse(errorBodyText);
      } catch (e) {
        console.error("[create-payment-preference] Mercado Pago API Error: Could not parse JSON response. Body:", errorBodyText);
        throw new Error(`Mercado Pago Error: ${response.statusText}`);
      }
      
      console.error("[create-payment-preference] Mercado Pago API Error:", errorBody);
      const cause = errorBody.cause && errorBody.cause.length > 0 ? errorBody.cause[0].description : errorBody.message;
      throw new Error(`Mercado Pago Error: ${cause || response.statusText}`);
    }

    const data = await response.json();
    console.log(`[create-payment-preference] Successfully created preference for orderId: ${orderId}`);

    return new Response(JSON.stringify({ init_point: data.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[create-payment-preference] Edge Function Catch Error:", error);
    // Garante que o erro seja retornado ao cliente para diagnóstico
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})