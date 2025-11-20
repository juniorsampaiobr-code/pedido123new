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

    // 1. Always create a new restaurant for the new admin user
    console.log(`[ensure-admin-access] Creating a new restaurant for user ${userId}.`);

    const restaurantName = fullName ? `${fullName}'s Restaurante` : 'Novo Restaurante';
    
    const { data: newRestaurant, error: insertRestaurantError } = await supabaseAdmin
      .from('restaurants')
      .insert({ 
        name: restaurantName, 
        description: 'Seu novo restaurante Pedido 123!',
        owner_user_id: userId, // Vincula o restaurante ao usuário
        is_active: true,
      })
      .select('id')
      .single();

    if (insertRestaurantError) throw new Error(`Failed to create restaurant: ${insertRestaurantError.message}`);
    
    const restaurantId = newRestaurant.id;
    console.log(`[ensure-admin-access] New restaurant created with ID: ${restaurantId}`);

    // 2. Ensure user has the 'admin' role and is linked to the new restaurant
    
    // Check if 'user' role exists for this user (inserted by handle_new_user trigger)
    const { data: existingRole, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .single();
      
    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        console.warn(`Error checking existing role: ${roleCheckError.message}`);
    }

    if (existingRole) {
        // Update existing 'user' role to 'admin' and link to the new restaurant
        const { error: updateRoleError } = await supabaseAdmin
          .from('user_roles')
          .update({ role: 'admin', restaurant_id: restaurantId })
          .eq('id', existingRole.id);
          
        if (updateRoleError) throw new Error(`Failed to update role to admin: ${updateRoleError.message}`);
    } else {
        // Insert the 'admin' role if no role was found (fallback)
        const { error: insertRoleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin', restaurant_id: restaurantId });
          
        if (insertRoleError) throw new Error(`Failed to insert admin role: ${insertRoleError.message}`);
    }

    return new Response(JSON.stringify({ 
      message: `Admin access ensured. New restaurant created and linked.`, 
      role: 'admin',
      restaurant_id: restaurantId
    }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error("[ensure-admin-access] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});