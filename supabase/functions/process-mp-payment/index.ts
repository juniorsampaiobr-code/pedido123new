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
    const { orderId, totalAmount, customerEmail, paymentData } = await req.json();
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
      throw new Error("Mercado Pago access token is not configured.");
    }
    if (!orderId || !totalAmount || !customerEmail || !paymentData) {
      return new Response(JSON.stringify({ error: 'Missing required payment data.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // O paymentData contém o token do cartão e outros dados de pagamento
    const paymentPayload = {
      transaction_amount: totalAmount,
      token: paymentData.token,
      description: `Pedido #${orderId.slice(-4)}`,
      installments: paymentData.installments,
      payment_method_id: paymentData.payment_method_id,
      payer: {
        email: customerEmail,
        identification: {
          type: paymentData.payer.identification.type,
          number: paymentData.payer.identification.number,
        },
      },
      external_reference: orderId,
    };

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mercado Pago Payment Error:", data);
      // Retorna o status do pagamento (e.g., rejected) ou um erro genérico
      return new Response(JSON.stringify({ 
        error: data.message || "Falha ao processar pagamento.",
        status: data.status_detail || 'rejected'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Retorna o status do pagamento (approved, pending, rejected)
    return new Response(JSON.stringify({ 
      message: "Payment processed.",
      status: data.status,
      status_detail: data.status_detail,
      payment_id: data.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message, status: 'error' }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});