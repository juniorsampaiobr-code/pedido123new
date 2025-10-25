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
    const { orderId } = await req.json();
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!accessToken) throw new Error("Mercado Pago access token is not configured.");
    if (!orderId) throw new Error("Order ID is required.");

    const searchResponse = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) throw new Error("Failed to search for payment.");

    const searchData = await searchResponse.json();
    const payment = searchData.results?.[0];

    if (!payment) {
       return new Response(JSON.stringify({ error: "Payment not found for this order." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    if (payment.status === 'approved') {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', orderId);

      if (updateError) throw new Error(`Failed to update order status: ${updateError.message}`);

      return new Response(JSON.stringify({ message: "Payment confirmed and order updated." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      return new Response(JSON.stringify({ message: "Payment not yet approved.", status: payment.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});