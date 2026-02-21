import DonationForm from '../DonationForm';

export default function DonationFormExample() {
  return (
    <div className="max-w-2xl">
      <DonationForm 
        sponsoredAnimalName="Whiskers"
        onSubmit={(data) => console.log('Donation data:', data)}
      />
    </div>
  );
}
