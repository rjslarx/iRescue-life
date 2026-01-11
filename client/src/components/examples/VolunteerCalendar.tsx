import VolunteerCalendar from '../VolunteerCalendar';

//todo: remove mock functionality
const mockOpportunities = [
  {
    id: "1",
    title: "Driver Needed for Vet Run",
    description: "Transport animals to City Vet Clinic for wellness checks",
    date: "Jan 20, 2024",
    time: "9:00 AM - 12:00 PM",
    location: "Main Shelter",
    slotsTotal: 2,
    slotsFilled: 1,
    signedUp: false,
  },
  {
    id: "2",
    title: "Adoption Event Handler",
    description: "Help manage our booth at the weekend adoption fair",
    date: "Jan 22, 2024",
    time: "10:00 AM - 4:00 PM",
    location: "Community Center",
    slotsTotal: 5,
    slotsFilled: 3,
    signedUp: true,
  },
  {
    id: "3",
    title: "Grant Writing Assistance",
    description: "Help research and draft grant applications",
    date: "Jan 25, 2024",
    time: "2:00 PM - 5:00 PM",
    location: "Remote",
    slotsTotal: 3,
    slotsFilled: 3,
    signedUp: false,
  },
];

export default function VolunteerCalendarExample() {
  return (
    <VolunteerCalendar 
      opportunities={mockOpportunities}
      onSignUp={(id) => console.log('Sign up for:', id)}
      onCancel={(id) => console.log('Cancel signup for:', id)}
    />
  );
}
