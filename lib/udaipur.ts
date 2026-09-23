import type { Category } from './types';

export type Spot = {
  id: string; name: string; emoji: string; cat: Category; blurb: string;
  pp: number; dur: string; best: string; tip: string;
};

// Rough per-person costs in ₹ — entry fees & prices change, so treat as planning estimates.
export const SPOTS: Spot[] = [
  { id: 'citypalace', name: 'City Palace', emoji: '🏰', cat: 'adventure', blurb: 'Sprawling palace complex over Lake Pichola, courtyards and mirror-work halls.', pp: 400, dur: '2–3 hrs', best: 'Morning', tip: 'Camera ticket is extra. Go early to beat tour groups.' },
  { id: 'pichola', name: 'Lake Pichola sunset boat', emoji: '🚣', cat: 'adventure', blurb: 'Boat ride past Jag Mandir and the Lake Palace as the sky turns gold.', pp: 500, dur: '1 hr', best: 'Sunset', tip: 'Book from Bansi Ghat / City Palace jetty. Ask for the 5–6 pm slot.' },
  { id: 'monsoon', name: 'Sajjangarh (Monsoon Palace)', emoji: '🌄', cat: 'adventure', blurb: 'Hilltop palace with a sweeping view over the whole city and lakes.', pp: 300, dur: '2 hrs', best: 'Sunset', tip: 'Cab up and back is easiest. Sunset crowds are big; go 45 min early.' },
  { id: 'saheliyon', name: 'Saheliyon ki Bari', emoji: '⛲', cat: 'adventure', blurb: 'Quiet fountain gardens built for royal ladies.', pp: 50, dur: '1 hr', best: 'Morning', tip: 'Small entry fee; nice with a Fateh Sagar stop after.' },
  { id: 'fatehsagar', name: 'Fateh Sagar & Neru Garden', emoji: '🌅', cat: 'adventure', blurb: 'Lakeside promenade, snacks, boat to Nehru Park island.', pp: 150, dur: '2 hrs', best: 'Evening', tip: 'Great for chai and street food after dark.' },
  { id: 'bagore', name: 'Bagore ki Haveli dance show', emoji: '💃', cat: 'adventure', blurb: 'Evening folk dance and puppet performance at Gangaur Ghat.', pp: 150, dur: '1 hr', best: '7 pm', tip: 'Show starts around 7 pm. Arrive 30 min ahead for seats.' },
  { id: 'jagdish', name: 'Jagdish Temple', emoji: '🛕', cat: 'adventure', blurb: 'Intricately carved Indo-Aryan temple right by the City Palace.', pp: 0, dur: '45 min', best: 'Evening aarti', tip: 'Free. Walk the lanes around it for cafes and shops.' },
  { id: 'ambrai', name: 'Ambrai Ghat cafés', emoji: '☕', cat: 'food', blurb: 'The postcard view of City Palace across the water — dinner spot.', pp: 600, dur: '2 hrs', best: 'Night', tip: 'Ask for a lakeside table. Book ahead on weekends.' },
  { id: 'kumbhalgarh', name: 'Kumbhalgarh day trip', emoji: '🧱', cat: 'travel', blurb: 'Fort with the second-longest wall in the world; add Ranakpur Jain temples.', pp: 900, dur: 'Full day', best: 'Leave by 8 am', tip: 'About 3 hrs each way by taxi; split one cab between the group.' },
  { id: 'shilpgram', name: 'Shilpgram craft village', emoji: '🎨', cat: 'shopping', blurb: 'Open-air crafts village with folk art and performances.', pp: 100, dur: '2 hrs', best: 'Afternoon', tip: 'Lively during festivals; check the calendar.' },
  { id: 'hathipol', name: 'Hathi Pol & Bada Bazaar', emoji: '🛍️', cat: 'shopping', blurb: 'Miniature paintings, textiles, silver jewellery and juttis.', pp: 1000, dur: '2 hrs', best: 'Evening', tip: 'Bargain politely: start at about half the first price.' },
  { id: 'eklingji', name: 'Eklingji & Nagda', emoji: '🕉️', cat: 'travel', blurb: 'Temple complex and ancient ruins by a lake, short drive out of the city.', pp: 250, dur: '3 hrs', best: 'Morning', tip: 'Combine with Haldighati if you like history.' },
];

export const LOCAL_COSTS = [
  { label: 'Auto-rickshaw across the old city', range: '₹80–200' },
  { label: 'Ola / Uber short ride', range: '₹100–250' },
  { label: 'Scooter rental per day', range: '₹400–600 + petrol' },
  { label: 'Full-day cab (8 hrs, local sightseeing)', range: '₹1,800–2,500' },
  { label: 'Day cab to Kumbhalgarh + Ranakpur', range: '₹3,500–5,000' },
  { label: 'Lakeside dinner per person', range: '₹500–900' },
  { label: 'Street food / chai day per person', range: '₹200–400' },
  { label: 'Budget hostel bed per night', range: '₹500–1,000' },
  { label: 'Mid-range hotel room per night', range: '₹2,500–5,500' },
];

type Seed = { day: number; time: string; title: string; note?: string; pp?: number; flat?: number; category: Category };
export const STARTER: Seed[] = [
  { day: 0, time: '11:00', title: 'Check in & settle at the stay', category: 'stay' },
  { day: 0, time: '13:30', title: 'Lunch near Gangaur Ghat', pp: 350, category: 'food' },
  { day: 0, time: '16:00', title: 'City Palace', note: 'Take the guide or audio tour.', pp: 400, category: 'adventure' },
  { day: 0, time: '17:45', title: 'Lake Pichola sunset boat ride', pp: 500, category: 'adventure' },
  { day: 0, time: '20:00', title: 'Dinner at Ambrai Ghat', pp: 600, category: 'food' },
  { day: 1, time: '09:00', title: 'Sajjangarh (Monsoon Palace)', flat: 1200, pp: 150, note: 'Cab up and back, split it.', category: 'adventure' },
  { day: 1, time: '12:30', title: 'Saheliyon ki Bari & lunch', pp: 400, category: 'food' },
  { day: 1, time: '16:00', title: 'Fateh Sagar & Neru Garden', pp: 150, category: 'adventure' },
  { day: 1, time: '19:00', title: 'Bagore ki Haveli dance show', pp: 150, category: 'adventure' },
  { day: 2, time: '08:00', title: 'Day trip: Kumbhalgarh & Ranakpur', flat: 4500, pp: 300, note: 'One cab for the group.', category: 'travel' },
  { day: 2, time: '19:00', title: 'Hathi Pol shopping + farewell dinner', pp: 1200, category: 'shopping' },
];
