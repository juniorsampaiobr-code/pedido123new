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
    const { userId, fullName } = await req.json();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use the Service Role Key for administrative actions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    let restaurantId: string;
    const restaurantName = fullName ? `${fullName}'s Restaurante` : 'Novo Restaurante';

    // 1. Tenta encontrar um restaurante existente vinculado ao usuário
    const { data: existingRestaurant, error: fetchRestaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('owner_user_id', userId)
      .limit(1)
      .single();
      
    if (fetchRestaurantError && fetchRestaurantError.code !== 'PGRST116') {
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
          name: restaurantName, 
          description: 'Seu novo restaurante Pedido 123!',
          owner_user_id: userId, 
          is_active: true,
        })
        .select('id')
        .single();

      if (insertRestaurantError) throw new Error(`Failed to create restaurant: ${insertRestaurantError.message}`);
      
      restaurantId = newRestaurant.id;
      console.log(`[ensure-admin-access] New restaurant created with ID: ${restaurantId}`);
    }

    // 3. Garante que o usuário tenha a role 'admin' e esteja vinculado ao restaurantId
    
    // Tenta encontrar a role existente (que deve ter sido criada pelo trigger handle_new_user)
    const { data: existingRole, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .limit(1)
      .single();
      
    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        console.warn(`Error checking existing role: ${roleCheckError.message}`);
    }

    if (existingRole) {
        // Atualiza a role existente para 'admin' e vincula ao restaurante
        const { error: updateRoleError } = await supabaseAdmin
          .from('user_roles')
          .update({ role: 'admin', restaurant_id: restaurantId })
          .eq('id', existingRole.id);
          
        if (updateRoleError) throw new Error(`Failed to update role to admin: ${updateRoleError.message}`);
    } else {
        // Insere a role 'admin' se nenhuma role foi encontrada (fallback)
        const { error: insertRoleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin', restaurant_id: restaurantId });
          
        if (insertRoleError) throw new Error(`Failed to insert admin role: ${insertRoleError.message}`);
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
    console.error("[ensure-admin-access] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});