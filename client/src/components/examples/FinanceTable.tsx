import FinanceTable from '../FinanceTable';

//todo: remove mock functionality
const mockDonations = [
  { id: "1", donorName: "John Smith", amount: 100, date: "2024-01-15", source: "Online Form" },
  { id: "2", donorName: "Jane Doe", amount: 250, date: "2024-01-14", source: "Manual Entry" },
  { id: "3", donorName: "Acme Corp", amount: 1000, date: "2024-01-10", source: "QuickBooks Import" },
];

const mockExpenditures = [
  { id: "1", vendor: "City Vet Clinic", amount: 450, date: "2024-01-16", category: "Vet" },
  { id: "2", vendor: "Pet Supplies Plus", amount: 125, date: "2024-01-12", category: "Food" },
];

export default function FinanceTableExample() {
  return (
    <FinanceTable 
      donations={mockDonations}
      expenditures={mockExpenditures}
      onAddDonation={(data) => console.log('Add donation:', data)}
      onAddExpenditure={(data) => console.log('Add expenditure:', data)}
      onUploadCSV={(file) => console.log('Upload CSV:', file.name)}
    />
  );
}
