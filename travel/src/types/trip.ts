export type TripStatus = 'active' | 'upcoming' | 'archive';

export interface FlightBooking {
  id: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDateTime: string;
  arrivalDateTime: string;
  confirmationCode?: string;
  seats?: string;
  terminalGate?: string;
  cost?: number;
  notes?: string;
}

export interface HotelBooking {
  id: string;
  name: string;
  address?: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  confirmationCode?: string;
  roomType?: string;
  cost?: number;
  notes?: string;
}

export interface RentalCarBooking {
  id: string;
  provider: string;
  pickupLocation: string;
  pickupDateTime: string;
  dropoffLocation?: string;
  dropoffDateTime?: string;
  confirmationCode?: string;
  vehicleType?: string;
  cost?: number;
  notes?: string;
}

export interface ActivityBooking {
  id: string;
  title: string;
  location?: string;
  dateTime?: string;
  confirmationCode?: string;
  cost?: number;
  notes?: string;
}

export interface TripBookings {
  flights: FlightBooking[];
  hotels: HotelBooking[];
  rentalCars: RentalCarBooking[];
  activities: ActivityBooking[];
}

export interface TripSection {
  id?: string;
  slug: string;
  title: string;
  icon?: string;
  content: string;
  order?: number;
}

export interface TripTodo {
  id: string;
  text: string;
  completed: boolean;
  category?: 'documents' | 'packing' | 'prep' | 'general' | string;
  dueDate?: string;
  priority?: 'high' | 'normal' | 'low';
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
  budget?: number;
  stats?: {
    days?: number;
    travelers?: number;
    season?: string;
    budget?: number;
    totalCost?: number;
  };
  bookings: TripBookings;
  todos: TripTodo[];
  notes: string; // Rich text / HTML content
  sections?: TripSection[];
  reservations?: any[];
  schedule?: any[];
  packingList?: any[];
}
