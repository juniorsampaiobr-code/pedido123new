import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { orderId } = await req.json();
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!accessToken) throw new Error("Mercado Pago access token is not configured.");
    if (!orderId) throw new Error("Order ID is required.");

    // 1. Busca o pagamento usando external_reference (orderId)
    const searchResponse = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error("Failed to search for payment. MP Response:", errorText);
        // Tenta extrair uma mensagem de erro mais útil
        let errorMessage = "Failed to search for payment.";
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorMessage;
        } catch (e) {
            // Ignora erro de parse
        }
        throw new Error(errorMessage);
    }

    const searchData = await searchResponse.json();
    const payment = searchData.results?.[0];

    if (!payment) {
       return new Response(JSON.stringify({ message: "Payment not found for this order.", status: 'not_found' }), {
        headers: corsHeaders,
        status: 404,
      });
    }
    
    const paymentStatus = payment.status;

    // 2. Se o pagamento estiver aprovado, atualiza o status do pedido no banco de dados para 'pending'
    if (paymentStatus === 'approved') {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({ status: 'pending' }) // Mudando para 'pending'
        .eq('id', orderId);

      if (updateError) throw new Error(`Failed to update order status: ${updateError.message}`);

      return new Response(JSON.stringify({ message: "Payment confirmed and order updated.", status: 'approved' }), {
        headers: corsHeaders,
        status: 200,
      });
    } else {
      // Retorna o status atual do pagamento (pending, rejected, etc.)
      return new Response(JSON.stringify({ message: `Payment status is: ${paymentStatus}`, status: paymentStatus }), {
        headers: corsHeaders,
        status: 200,
      });
    }

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message, status: 'error' }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});