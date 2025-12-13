import { Tables } from '@/integrations/supabase/types';
import { Clock, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBusinessStatus } from '@/utils/time';

type Restaurant = Tables<'restaurants'>;
type BusinessHour = Tables<'business_hours'>;

interface BusinessStatusProps {
  restaurant: Restaurant;
  hours: BusinessHour[];
}

export const BusinessStatus = ({ restaurant, hours }: BusinessStatusProps) => {
  const { isOpen, todayHours } = getBusinessStatus(hours);

  const fullAddress = [
    restaurant.street,
    restaurant.number,
    restaurant.neighborhood,
    restaurant.city,
    restaurant.zip_code,
  ].filter(Boolean).join(', ');

  return (
    <div className="space-y-3 text-center">
      {/* Address */}
      {fullAddress && (
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
          <span className="truncate max-w-full">{fullAddress}</span>
        </div>
      )}

      {/* Status and Hours */}
      <div className="flex items-center justify-center text-sm font-medium">
        <div className={cn(
          "flex items-center gap-1 px-3 py-1 rounded-full",
          isOpen ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
        )}>
          {isOpen ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{isOpen ? 'Aberto Agora' : 'Fechado'}</span>
        </div>
        
        <div className="ml-4 flex items-center text-muted-foreground">
            <Clock className="h-4 w-4 mr-1" />
            <span>{todayHours}</span>
        </div>
      </div>
    </div>
  );
};