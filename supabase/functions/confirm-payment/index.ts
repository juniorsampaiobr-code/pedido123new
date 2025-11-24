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
    
    // 1. Buscar o Access Token do restaurante no DB (usando Service Role)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("[confirm-payment] FATAL: Missing Supabase environment variables.");
        throw new Error("Supabase environment variables are not configured correctly.");
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    // 1.1. Buscar o restaurant_id do pedido
    const { data: orderData, error: orderFetchError } = await supabaseAdmin
        .from('orders')
        .select('restaurant_id')
        .eq('id', orderId)
        .single();
        
    if (orderFetchError) throw new Error(`Failed to fetch order restaurant ID: ${orderFetchError.message}`);
    const restaurantId = orderData.restaurant_id;

    // 1.2. Buscar o Access Token do restaurante no DB
    const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from('payment_settings')
        .select('mercado_pago_access_token')
        .eq('restaurant_id', restaurantId)
        .single();
        
    if (settingsError || !settingsData?.mercado_pago_access_token) {
        console.error(`[confirm-payment] Access Token not found for restaurant ${restaurantId}.`);
        throw new Error("Mercado Pago Access Token não configurado para este restaurante.");
    }
    
    const accessToken = settingsData.mercado_pago_access_token;
    
    if (!orderId) throw new Error("Order ID is required.");

    // 2. Busca o pagamento usando external_reference (orderId)
    const searchResponse = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error("Failed to search for payment. MP Response:", errorText);
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

    // 3. Se o pagamento estiver aprovado, atualiza o status do pedido no banco de dados para 'pending'
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
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage, status: 'error' }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});