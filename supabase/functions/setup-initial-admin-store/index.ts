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

    // 1. Check if any restaurant exists
    const { data: existingRestaurants, error: restError } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .limit(1);

    if (restError && restError.code !== 'PGRST116') throw new Error(`Database error checking restaurants: ${restError.message}`);

    const isFirstStore = existingRestaurants === null || existingRestaurants.length === 0;

    if (isFirstStore) {
      console.log(`[setup-initial-admin-store] First store detected. Setting up admin role and restaurant for user ${userId}.`);

      // 2. Create a new restaurant
      const restaurantName = fullName ? `${fullName}'s Restaurante` : 'Novo Restaurante';
      
      const { data: newRestaurant, error: insertError } = await supabaseAdmin
        .from('restaurants')
        .insert({ 
          name: restaurantName, 
          description: 'Seu novo restaurante Pedido 123!',
          owner_user_id: userId, // Link the new user as the owner
          is_active: true,
        })
        .select('id')
        .single();

      if (insertError) throw new Error(`Failed to create restaurant: ${insertError.message}`);
      
      // 3. Promote user to 'admin' role
      // Check if 'user' role exists for this user (inserted by handle_new_user trigger)
      const { data: existingRole, error: roleCheckError } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'user')
        .limit(1)
        .single();
        
      if (roleCheckError && roleCheckError.code !== 'PGRST116') {
          console.warn(`Error checking existing 'user' role: ${roleCheckError.message}`);
      }

      if (existingRole) {
          // Update existing 'user' role to 'admin'
          const { error: updateRoleError } = await supabaseAdmin
            .from('user_roles')
            .update({ role: 'admin' })
            .eq('id', existingRole.id);
            
          if (updateRoleError) throw new Error(`Failed to update role to admin: ${updateRoleError.message}`);
      } else {
          // Insert 'admin' role if 'user' role wasn't found (fallback)
          const { error: insertRoleError } = await supabaseAdmin
            .from('user_roles')
            .insert({ user_id: userId, role: 'admin' });
            
          if (insertRoleError) throw new Error(`Failed to insert admin role: ${insertRoleError.message}`);
      }

      return new Response(JSON.stringify({ 
        message: "Initial store setup complete.", 
        restaurantId: newRestaurant.id,
        role: 'admin'
      }), {
        headers: corsHeaders,
        status: 200,
      });
    }

    // If a store already exists, do nothing (rely on existing role check)
    return new Response(JSON.stringify({ message: "Store already exists, no action taken." }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error("[setup-initial-admin-store] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});