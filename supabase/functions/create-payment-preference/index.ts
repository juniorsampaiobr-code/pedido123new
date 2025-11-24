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
    const { orderId, items, totalAmount, restaurantName, clientUrl, customerEmail, customerCpfCnpj } = await req.json();
    console.log(`[create-payment-preference] Received request for orderId: ${orderId}, Total: ${totalAmount}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("[create-payment-preference] FATAL: Missing Supabase environment variables.");
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
    
    // 1. Buscar o restaurant_id do pedido
    const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('restaurant_id')
        .eq('id', orderId)
        .single();
        
    if (orderError) throw new Error(`Failed to fetch order restaurant ID: ${orderError.message}`);
    const restaurantId = orderData.restaurant_id;

    // 2. Buscar o Access Token do restaurante no DB
    const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from('payment_settings')
        .select('mercado_pago_access_token')
        .eq('restaurant_id', restaurantId)
        .single();
        
    if (settingsError || !settingsData?.mercado_pago_access_token) {
        console.error(`[create-payment-preference] Access Token not found for restaurant ${restaurantId}.`);
        throw new Error("Mercado Pago Access Token não configurado para este restaurante.");
    }
    
    const accessToken = settingsData.mercado_pago_access_token;
    
    if (!clientUrl) {
      console.error("[create-payment-preference] FATAL: Client URL is missing from the request body.");
      throw new Error("Client URL is required for payment redirection.");
    }

    // --- 3. Processar Itens e Calcular Subtotal ---
    let calculatedSubtotal = 0;
    
    const preferenceItems = items.map((item: any) => {
      // Garante que price e quantity são números válidos
      const priceValue = parseFloat(item.price);
      const quantityValue = parseInt(item.quantity);
      
      if (isNaN(priceValue) || priceValue <= 0 || isNaN(quantityValue) || quantityValue <= 0) {
        console.warn(`[create-payment-preference] Filtering out invalid item: ${item.name} (Price: ${item.price}, Qty: ${item.quantity})`);
        return null;
      }
      
      // O Mercado Pago espera o preço unitário com 2 casas decimais
      const unit_price = parseFloat(priceValue.toFixed(2));
      
      calculatedSubtotal += unit_price * quantityValue;

      return {
        title: item.name,
        quantity: quantityValue,
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

    // Garante que o total e o subtotal são tratados como números de duas casas decimais
    const fixedTotalAmount = parseFloat(totalAmount.toFixed(2));
    const fixedSubtotal = parseFloat(calculatedSubtotal.toFixed(2));

    // --- 4. Calcular Taxa de Entrega ---
    let deliveryFee = fixedTotalAmount - fixedSubtotal;

    if (deliveryFee < 0.01) { 
      deliveryFee = 0;
    } else {
      deliveryFee = parseFloat(deliveryFee.toFixed(2));
    }

    if (deliveryFee > 0) {
      preferenceItems.push({
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: deliveryFee,
        currency_id: 'BRL',
      });
      console.log(`[create-payment-preference] Added delivery fee of ${deliveryFee.toFixed(2)}`);
    }
    
    const finalPreferenceTotal = preferenceItems.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);
    
    if (Math.abs(finalPreferenceTotal - fixedTotalAmount) > 0.01) {
        console.error(`[create-payment-preference] FATAL: Total mismatch. Expected: ${fixedTotalAmount}, Calculated from items: ${finalPreferenceTotal}`);
        throw new Error(`Inconsistência no valor total do pedido. Total esperado: R$${fixedTotalAmount.toFixed(2)}, Total calculado: R$${finalPreferenceTotal.toFixed(2)}.`);
    }
    
    console.log(`[create-payment-preference] Final total verified: R$${finalPreferenceTotal.toFixed(2)}`);


    // --- 5. Preparar Preferência ---
    let sanitizedRestaurantName = restaurantName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
      .replace(/[^a-zA-Z0-9 ]/g, '') 
      .toUpperCase() 
      .substring(0, 22)
      .trim();
    
    if (!sanitizedRestaurantName) {
      sanitizedRestaurantName = "PEDIDO123";
    }
    
    // Determinar o tipo de identificação (CPF ou CNPJ)
    let identificationType = 'CPF';
    if (customerCpfCnpj && customerCpfCnpj.length === 14) {
        identificationType = 'CNPJ';
    }

    const payerIdentification = customerCpfCnpj ? {
        type: identificationType,
        number: customerCpfCnpj,
    } : undefined;
    
    console.log(`[create-payment-preference] Payer Identification: ${JSON.stringify(payerIdentification)}`);

    // --- Ajuste nas URLs de retorno: Todas apontam para PaymentRedirect para verificação ---
    // O Mercado Pago adiciona 'status', 'external_reference' e 'payment_id' automaticamente.
    const redirectBaseUrl = `${clientUrl.replace(/\/$/, '')}/#/payment-redirect/${orderId}?restaurantId=${restaurantId}`;

    const preference = {
      items: preferenceItems,
      payer: {
        email: customerEmail,
        identification: payerIdentification,
      },
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" }
        ],
        installments: 1
      },
      back_urls: {
        success: redirectBaseUrl,
        failure: redirectBaseUrl, 
        pending: redirectBaseUrl,
      },
      // Adiciona auto_return para forçar o redirecionamento
      auto_return: 'all', 
      external_reference: orderId,
      statement_descriptor: sanitizedRestaurantName,
    };

    console.log('[create-payment-preference] Creating preference with payload (excluding items for brevity):', JSON.stringify({ ...preference, items: '...' }, null, 2));

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
      
      let cause = errorBody.cause && Array.isArray(errorBody.cause) && errorBody.cause.length > 0
          ? errorBody.cause[0].description || errorBody.cause[0].code || response.statusText
          : errorBody.message || response.statusText;
      
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
    
    if (error instanceof Error) {
        console.error("[create-payment-preference] Full Error Stack:", error.stack);
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});