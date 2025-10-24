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

    // 1. Initialize Supabase client with Service Role Key for secure database access
    // We use the Service Role Key here because we need to check the Access Token against a secret
    // and potentially perform privileged operations, although for this specific task, 
    // we only need to save the public key.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Check if the provided Access Token matches the secret stored in Supabase environment
    const storedAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    let tokenMatch = false;
    if (storedAccessToken && access_token === storedAccessToken) {
        tokenMatch = true;
    }

    // 3. Save the Public Key in the database (using the Admin client)
    const { data: existingSettings } = await supabaseAdmin
        .from('payment_settings')
        .select('id')
        .eq('restaurant_id', restaurant_id)
        .limit(1)
        .single();

    let dbError;
    if (existingSettings) {
        const { error } = await supabaseAdmin
            .from('payment_settings')
            .update({ mercado_pago_public_key: public_key })
            .eq('id', existingSettings.id);
        dbError = error;
    } else {
        const { error } = await supabaseAdmin
            .from('payment_settings')
            .insert({ restaurant_id, mercado_pago_public_key: public_key });
        dbError = error;
    }

    if (dbError) {
        console.error('Database error:', dbError);
        return new Response(JSON.stringify({ error: 'Failed to save public key.' }), {
            status: 500,
            headers: corsHeaders,
        });
    }

    return new Response(JSON.stringify({ 
        message: 'Credentials saved successfully.',
        token_verified: tokenMatch,
    }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    })
  }
})