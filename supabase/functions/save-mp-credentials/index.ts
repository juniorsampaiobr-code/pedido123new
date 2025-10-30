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

    // 1. Verificar se já existe uma configuração para este restaurante
    const { data: existingSetting, error: selectError } = await supabaseAdmin
      .from('payment_settings')
      .select('restaurant_id')
      .eq('restaurant_id', restaurant_id)
      .single();

    // Ignora o erro 'PGRST116' que significa "nenhuma linha encontrada", pois isso é esperado
    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Error checking for existing settings:', selectError);
      throw new Error(`Failed to check for settings: ${selectError.message}`);
    }

    let dbError;
    if (existingSetting) {
      // 2a. Se existe, ATUALIZA a chave pública
      console.log(`Existing setting found for restaurant ${restaurant_id}. Updating...`);
      const { error } = await supabaseAdmin
        .from('payment_settings')
        .update({ mercado_pago_public_key: public_key })
        .eq('restaurant_id', restaurant_id);
      dbError = error;
    } else {
      // 2b. Se não existe, INSERE uma nova configuração
      console.log(`No setting found for restaurant ${restaurant_id}. Inserting...`);
      const { error } = await supabaseAdmin
        .from('payment_settings')
        .insert({
          restaurant_id: restaurant_id,
          mercado_pago_public_key: public_key
        });
      dbError = error;
    }

    if (dbError) {
      console.error('Database operation error:', dbError);
      throw new Error(`Failed to save public key: ${dbError.message}`);
    }

    // 3. Verificar o Access Token (mesma lógica de antes)
    const storedAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    const tokenMatch = storedAccessToken && access_token === storedAccessToken;

    return new Response(JSON.stringify({ 
        message: 'Credentials saved successfully.',
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