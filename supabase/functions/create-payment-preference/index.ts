import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Tenta ler o Access Token
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
      console.error("[create-payment-preference] FATAL: MERCADO_PAGO_ACCESS_TOKEN is missing.");
      return new Response(JSON.stringify({ error: "MERCADO_PAGO_ACCESS_TOKEN is missing from environment secrets." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    // Se o token for encontrado, retorna sucesso
    return new Response(JSON.stringify({ 
      message: "Access Token successfully loaded in Edge Function environment.",
      token_loaded: true,
      token_prefix: accessToken.substring(0, 5) + '...',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[create-payment-preference] Edge Function Catch Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error during token check." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})