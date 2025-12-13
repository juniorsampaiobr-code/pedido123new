import { Tables } from '@/integrations/supabase/types';

type BusinessHour = Tables<'business_hours'>;

// Helper function to get current time in HH:MM format (local time)
const getCurrentTimeHHMM = (): string => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Helper function to get current day of week (0 = Sunday, 6 = Saturday)
const getCurrentDayOfWeek = (): number => {
  return new Date().getDay();
};

export const getBusinessStatus = (hours: BusinessHour[]): { isOpen: boolean, todayHours: string } => {
  const currentDay = getCurrentDayOfWeek();
  const currentTime = getCurrentTimeHHMM();

  const todaySchedule = hours.find(h => h.day_of_week === currentDay);

  if (!todaySchedule || !todaySchedule.is_open) {
    return { isOpen: false, todayHours: 'Fechado hoje' };
  }

  const openTime = todaySchedule.open_time;
  const closeTime = todaySchedule.close_time;

  if (!openTime || !closeTime) {
      return { isOpen: false, todayHours: 'Horário não configurado' };
  }

  // Simple string comparison for HH:MM format
  const isOpen = currentTime >= openTime && currentTime <= closeTime;
  const todayHours = `${openTime.substring(0, 5)} - ${closeTime.substring(0, 5)}`;

  return { isOpen, todayHours };
};