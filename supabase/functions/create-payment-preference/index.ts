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
    console.log(`[create-payment-preference] Received request for orderId: ${orderId}, Total: ${totalAmount}`);

    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
      console.error("[create-payment-preference] FATAL: MERCADO_PAGO_ACCESS_TOKEN is not configured in Supabase secrets.");
      return new Response(JSON.stringify({ error: "Mercado Pago access token is not configured." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    if (!clientUrl) {
      console.error("[create-payment-preference] FATAL: Client URL is missing from the request body.");
      throw new Error("Client URL is required for payment redirection.");
    }

    // --- 1. Processar Itens e Calcular Subtotal ---
    const preferenceItems = items.map((item: any) => {
      // Garante que o preço unitário é um número com 2 casas decimais
      const unit_price = parseFloat(item.price.toFixed(2));
      
      if (unit_price <= 0 || !item.quantity || item.quantity <= 0) {
        console.warn(`[create-payment-preference] Filtering out invalid item: ${item.name} (Price: ${item.price}, Qty: ${item.quantity})`);
        return null;
      }
      return {
        title: item.name,
        quantity: item.quantity,
        unit_price: unit_price,
        currency_id: 'BRL',
      };
    }).filter(Boolean);

    if (preferenceItems.length === 0) {
      console.error("[create-payment-preference] FATAL: No valid items found after filtering.");
      return new Response(JSON.stringify({ error: "No valid items to process for payment." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Recalcula o subtotal com base nos itens válidos
    const subtotal = preferenceItems.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);
    
    // --- 2. Calcular Taxa de Entrega ---
    // Usamos Math.round para evitar problemas de ponto flutuante ao subtrair
    let deliveryFee = Math.round((totalAmount - subtotal) * 100) / 100;

    // Se a taxa for negativa (erro de arredondamento ou lógica), forçamos a zero.
    if (deliveryFee < 0) {
      console.warn(`[create-payment-preference] Negative delivery fee calculated (${deliveryFee}). Forcing to 0.`);
      deliveryFee = 0;
    }

    // Adiciona a taxa de entrega como um item separado, se for positiva
    if (deliveryFee > 0) {
      preferenceItems.push({
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: parseFloat(deliveryFee.toFixed(2)), // Garante 2 casas decimais
        currency_id: 'BRL',
      });
      console.log(`[create-payment-preference] Added delivery fee of ${deliveryFee.toFixed(2)}`);
    }

    // --- 3. Preparar Preferência ---
    // Sanitiza o nome do restaurante para o statement_descriptor (máx 22 caracteres, apenas alfanumérico)
    let sanitizedRestaurantName = restaurantName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^a-zA-Z0-9 ]/g, '') // Remove caracteres especiais (exceto espaços)
      .toUpperCase() // Converte para maiúsculas
      .substring(0, 22)
      .trim();
    
    if (!sanitizedRestaurantName) {
      sanitizedRestaurantName = "PEDIDO123";
    }

    const preference = {
      items: preferenceItems,
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" }
        ],
        installments: 1
      },
      back_urls: {
        success: `${clientUrl}/#/order-success/${orderId}?status=approved`,
        failure: `${clientUrl}/#/checkout?status=failure`,
        pending: `${clientUrl}/#/checkout?status=pending`,
      },
      auto_return: 'approved',
      external_reference: orderId,
      statement_descriptor: sanitizedRestaurantName,
    };

    console.log('[create-payment-preference] Creating preference with payload:', JSON.stringify(preference, null, 2));

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });

    const responseBodyText = await response.text();
    
    if (!response.ok) {
      let errorBody;
      try {
        errorBody = JSON.parse(responseBodyText);
      } catch (e) {
        console.error("[create-payment-preference] Mercado Pago API Error: Could not parse JSON response. Body:", responseBodyText);
        throw new Error(`Mercado Pago Error: ${response.statusText}. Raw Body: ${responseBodyText}`);
      }
      
      console.error("[create-payment-preference] Mercado Pago API Error:", errorBody);
      
      // Safely extract error cause
      let cause = errorBody.message || response.statusText;
      if (errorBody.cause && Array.isArray(errorBody.cause) && errorBody.cause.length > 0) {
          cause = errorBody.cause[0].description || errorBody.cause[0].code || cause;
      }
      
      throw new Error(`Mercado Pago Error: ${cause}`);
    }

    const data = JSON.parse(responseBodyText);
    console.log(`[create-payment-preference] Successfully created preference for orderId: ${orderId}`);

    return new Response(JSON.stringify({ init_point: data.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[create-payment-preference] Edge Function Catch Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});