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
    const targetRole = isFirstStore ? 'admin' : 'moderator'; // Novo usuário em um sistema existente se torna 'moderator'

    // 2. Handle Restaurant Creation (Only if it's the first store)
    if (isFirstStore) {
      console.log(`[ensure-admin-access] First store detected. Creating restaurant for user ${userId}.`);

      const restaurantName = fullName ? `${fullName}'s Restaurante` : 'Novo Restaurante';
      
      const { error: insertError } = await supabaseAdmin
        .from('restaurants')
        .insert({ 
          name: restaurantName, 
          description: 'Seu novo restaurante Pedido 123!',
          owner_user_id: userId,
          is_active: true,
        });

      if (insertError) throw new Error(`Failed to create restaurant: ${insertError.message}`);
    }
    
    // 3. Ensure user has the correct role (admin for first user, moderator for subsequent users)
    
    // Check if 'user' role exists for this user (inserted by handle_new_user trigger)
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
        // Update existing role to the target role (admin or moderator)
        const { error: updateRoleError } = await supabaseAdmin
          .from('user_roles')
          .update({ role: targetRole })
          .eq('id', existingRole.id);
          
        if (updateRoleError) throw new Error(`Failed to update role to ${targetRole}: ${updateRoleError.message}`);
    } else {
        // Insert the target role if no role was found (fallback)
        const { error: insertRoleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: userId, role: targetRole });
          
        if (insertRoleError) throw new Error(`Failed to insert ${targetRole} role: ${insertRoleError.message}`);
    }

    return new Response(JSON.stringify({ 
      message: `Admin access ensured. Role set to ${targetRole}.`, 
      role: targetRole
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