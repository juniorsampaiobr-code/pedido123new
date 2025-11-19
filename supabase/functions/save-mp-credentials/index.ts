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
    const { public_key, access_token, restaurant_id } = await req.json();

    if (!restaurant_id || !public_key || !access_token) {
      return new Response(JSON.stringify({ error: 'Missing required fields.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Upsert (Update or Insert) the payment setting with the public key
    const { error: dbError } = await supabaseAdmin
      .from('payment_settings')
      .upsert({
        restaurant_id: restaurant_id,
        mercado_pago_public_key: public_key
      }, { onConflict: 'restaurant_id' });

    if (dbError) {
      console.error('Database operation error:', dbError);
      throw new Error(`Failed to save public key: ${dbError.message}`);
    }

    // 2. Verify the provided Access Token against the one stored in Supabase secrets
    const storedAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    const tokenMatch = storedAccessToken && access_token === storedAccessToken;

    let message = 'Chave pública salva com sucesso.';
    if (!tokenMatch) {
        if (storedAccessToken) {
            message = 'A Chave Pública foi salva, mas o Access Token que você digitou não corresponde ao que está salvo nos Segredos do Supabase. O pagamento online não funcionará até que o segredo correto seja configurado no painel do Supabase.';
        } else {
            message = 'A Chave Pública foi salva, mas o segredo MERCADO_PAGO_ACCESS_TOKEN não foi encontrado no seu projeto Supabase. O pagamento online não funcionará até que você o configure no painel do Supabase.';
        }
    }

    return new Response(JSON.stringify({ 
        message: message,
        token_verified: tokenMatch,
    }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error('General Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    })
  }
})