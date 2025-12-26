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
    // NOVO: Recebendo storeName, cpfCnpj e phone
    const { userId, fullName, storeName, cpfCnpj, phone } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use the Service Role Key for administrative actions
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("[ensure-admin-access] FATAL: Missing Supabase environment variables.");
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

    let restaurantId: string;

    // Usa o storeName fornecido ou um fallback
    const finalRestaurantName = storeName || (fullName ? `${fullName}'s Restaurante` : 'Novo Restaurante');
    
    // Define a URL padrão do som (agora que está no diretório public)
    const defaultNotificationSoundUrl = '/default-notification.mp3';

    // 1. Tenta encontrar um restaurante existente vinculado ao usuário
    const { data: existingRestaurant, error: fetchRestaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('owner_user_id', userId)
      .limit(1)
      .single();

    if (fetchRestaurantError && fetchRestaurantError.code !== 'PGRST116') {
      console.error(`[ensure-admin-access] DB Error checking existing restaurant: ${fetchRestaurantError.message}`);
      throw new Error(`Failed to check existing restaurant: ${fetchRestaurantError.message}`);
    }

    if (existingRestaurant) {
      restaurantId = existingRestaurant.id;
      console.log(`[ensure-admin-access] Existing restaurant found with ID: ${restaurantId}`);
    } else {
      // 2. Se não encontrar, cria um novo restaurante
      console.log(`[ensure-admin-access] Creating a new restaurant for user ${userId}.`);
      const { data: newRestaurant, error: insertRestaurantError } = await supabaseAdmin
        .from('restaurants')
        .insert({
          name: finalRestaurantName, // USANDO O NOME DA LOJA
          phone: phone, // SALVANDO O TELEFONE DO RESTAURANTE
          description: 'Seu novo restaurante Pedido 123!',
          owner_user_id: userId,
          is_active: true,
          // NOVO: Define o som de notificação padrão
          notification_sound_url: defaultNotificationSoundUrl,
        })
        .select('id')
        .single();

      if (insertRestaurantError) {
        console.error(`[ensure-admin-access] DB Error creating restaurant: ${insertRestaurantError.message}`);
        throw new Error(`Failed to create restaurant: ${insertRestaurantError.message}`);
      }

      restaurantId = newRestaurant.id;
      console.log(`[ensure-admin-access] New restaurant created with ID: ${restaurantId}`);
    }

    // 3. Garante que o usuário tenha a role 'admin' e esteja vinculado ao restaurantId
    // Tenta encontrar a role 'admin' ou 'user'
    const { data: existingRoles, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId);

    if (roleCheckError) {
      console.warn(`[ensure-admin-access] DB Warning checking existing roles: ${roleCheckError.message}`);
    }

    const adminRole = existingRoles?.find(r => r.role === 'admin');
    const userRole = existingRoles?.find(r => r.role === 'user');
    
    console.log(`[ensure-admin-access] Admin Role found: ${!!adminRole}, User Role found: ${!!userRole}`);

    if (adminRole) {
      // Se a role 'admin' já existe, apenas garante que o restaurant_id esteja vinculado
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ restaurant_id: restaurantId })
        .eq('id', adminRole.id);
      
      if (updateRoleError) {
        console.error(`[ensure-admin-access] DB Error updating existing admin role restaurant_id: ${updateRoleError.message}`);
        throw new Error(`Failed to update existing admin role: ${updateRoleError.message}`);
      }
      
      console.log(`[ensure-admin-access] Existing admin role linked to restaurant.`);
    } else if (userRole) {
      // Se a role 'user' existe, promove para 'admin' e vincula o restaurant_id
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ 
          role: 'admin',
          restaurant_id: restaurantId
        })
        .eq('id', userRole.id);
      
      if (updateRoleError) {
        console.error(`[ensure-admin-access] DB Error promoting user role: ${updateRoleError.message}`);
        throw new Error(`Failed to promote user role to admin: ${updateRoleError.message}`);
      }
      
      console.log(`[ensure-admin-access] User role promoted to admin.`);
    } else {
      // Fallback: Insere a role 'admin' se nenhuma role foi encontrada
      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'admin',
          restaurant_id: restaurantId
        });
      
      if (insertRoleError) {
        console.error(`[ensure-admin-access] DB Error inserting admin role: ${insertRoleError.message}`);
        throw new Error(`Failed to insert admin role: ${insertRoleError.message}`);
      }
      
      console.log(`[ensure-admin-access] Admin role inserted successfully.`);
    }

    return new Response(JSON.stringify({
      message: `Admin access ensured. Restaurant linked.`,
      role: 'admin',
      restaurant_id: restaurantId
    }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error("[ensure-admin-access] General Error:", error);
    
    // Tenta retornar a mensagem de erro detalhada no corpo, mesmo em caso de 500
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});