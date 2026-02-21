import ContactCard from '../ContactCard';

//todo: remove mock functionality
const mockContact = {
  id: "1",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(555) 123-4567",
  totalDonated: 750,
  donationCount: 3,
  adoptions: ["Buddy", "Luna"],
};

export default function ContactCardExample() {
  return (
    <div className="max-w-sm">
      <ContactCard 
        contact={mockContact}
        onClick={() => console.log('Contact clicked')}
      />
    </div>
  );
}
