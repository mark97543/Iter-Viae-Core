export type TripStatus = 'active' | 'upcoming' | 'archive';

export interface Activity {
  time?: string;
  title: string;
  location?: string;
  description?: string;
  confirmationCode?: string;
  cost?: string;
  tags?: string[];
}

export interface DaySchedule {
  dayNumber: number;
  date?: string;
  title: string;
  subtitle?: string;
  activities: Activity[];
  notes?: string;
}

export interface Reservation {
  type: 'flight' | 'hotel' | 'car' | 'train' | 'activity' | 'other';
  title: string;
  provider?: string;
  confirmationCode?: string;
  dates?: string;
  addressOrDetails?: string;
  notes?: string;
}

export interface PackingCategory {
  category: string;
  items: string[];
}

export interface TripSection {
  id?: string;
  slug: string;
  title: string;
  icon?: string;
  content: string;
  order?: number;
}

export interface Trip {
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  destination: string;
  dates: string;
  status: TripStatus;
  coverEmoji: string;
  coverGradient: string;
  summary: string;
  stats?: {
    days?: number;
    travelers?: number;
    season?: string;
  };
  sections?: TripSection[];
  schedule: DaySchedule[];
  reservations: Reservation[];
  packingList: PackingCategory[];
  notes: string[];
}
