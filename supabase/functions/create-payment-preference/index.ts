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
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
      console.error("MERCADO_PAGO_ACCESS_TOKEN is not configured.");
      throw new Error("Mercado Pago access token is not configured.");
    }
    if (!clientUrl) {
      console.error("Client URL is missing.");
      throw new Error("Client URL is required for payment redirection.");
    }

    // Mapeia os itens do carrinho para o formato do Mercado Pago
    const preferenceItems = items.map((item: any) => ({
      title: item.name,
      quantity: item.quantity,
      unit_price: parseFloat(item.price.toFixed(2)), // Garante que o preço seja um número com 2 casas decimais
      currency_id: 'BRL',
    }));

    // Calcula o subtotal a partir dos itens e, em seguida, a taxa de entrega
    const subtotal = preferenceItems.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);
    const deliveryFee = totalAmount - subtotal;

    // Adiciona a taxa de entrega como um item separado, se houver
    if (deliveryFee > 0) {
      preferenceItems.push({
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: parseFloat(deliveryFee.toFixed(2)),
        currency_id: 'BRL',
      });
    }

    const preference = {
      items: preferenceItems,
      back_urls: {
        success: `${clientUrl}/#/order-success/${orderId}?status=approved`,
        failure: `${clientUrl}/#/checkout?status=failure`,
        pending: `${clientUrl}/#/checkout?status=pending`,
      },
      auto_return: 'approved',
      external_reference: orderId,
      statement_descriptor: restaurantName.substring(0, 22),
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error("Mercado Pago API Error:", errorBody); // Loga o erro da API
      throw new Error(`Failed to create payment preference: ${errorBody.message || response.statusText}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ init_point: data.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Edge Function Catch Error:", error); // Loga o erro geral
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders,
      status: 500,
    });
  }
});