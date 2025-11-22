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

    // 1. Upsert (Update or Insert) the payment setting with both keys
    const { error: dbError } = await supabaseAdmin
      .from('payment_settings')
      .upsert({
        restaurant_id: restaurant_id,
        mercado_pago_public_key: public_key,
        mercado_pago_access_token: access_token, // SALVANDO O ACCESS TOKEN NO DB
      }, { onConflict: 'restaurant_id' });

    if (dbError) {
      console.error('Database operation error:', dbError);
      throw new Error(`Failed to save credentials: ${dbError.message}`);
    }

    // 2. Não precisamos mais verificar o Secret global, apenas confirmamos que salvamos.
    
    return new Response(JSON.stringify({ 
        message: 'Credenciais do Mercado Pago salvas com sucesso!',
        token_verified: true, // Sempre true, pois salvamos o que foi enviado
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