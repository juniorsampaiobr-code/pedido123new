import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { toast } from "sonner";
import { SupabaseUser } from '@supabase/supabase-js';
import { Tables, Enums } from '@/integrations/supabase/types';
import { ShoppingCart, Loader2, User, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MobileSidebar } from "@/components/MobileSidebar";
import { AdminProfileModal } from "@/components/AdminProfileModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ✅ ADD THIS IMPORT
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useActiveRestaurantId } from '@/hooks/use-active-restaurant-id';

type Restaurant = Tables<'restaurants'>;
type AudioReadyState = 'loading' | 'ready' | 'error';
type AppRole = Enums<'app_role'>;

export type DashboardContextType = { restaurant: Restaurant; userRestaurantId: string; };

// ... rest of the file remains unchanged