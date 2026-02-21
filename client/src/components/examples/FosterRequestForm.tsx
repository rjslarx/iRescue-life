import FosterRequestForm from '../FosterRequestForm';

export default function FosterRequestFormExample() {
  return (
    <div className="max-w-2xl">
      <FosterRequestForm 
        fosterName="Jane Foster"
        onSubmitSupplyRequest={(data) => console.log('Supply request:', data)}
        onSubmitMedicalTriage={(data) => console.log('Medical triage:', data)}
      />
    </div>
  );
}
