import KanbanBoard from '../KanbanBoard';

//todo: remove mock functionality
const mockApplications = [
  { id: "1", applicantName: "Sarah Johnson", animalName: "Buddy", email: "sarah@example.com", phone: "(555) 123-4567", stage: "new" },
  { id: "2", applicantName: "Mike Chen", animalName: "Whiskers", email: "mike@example.com", phone: "(555) 234-5678", stage: "new" },
  { id: "3", applicantName: "Emma Davis", animalName: "Luna", email: "emma@example.com", phone: "(555) 345-6789", stage: "screening" },
  { id: "4", applicantName: "James Wilson", animalName: "Max", email: "james@example.com", phone: "(555) 456-7890", stage: "vet_check" },
  { id: "5", applicantName: "Lisa Anderson", animalName: "Bella", email: "lisa@example.com", phone: "(555) 567-8901", stage: "approved" },
];

export default function KanbanBoardExample() {
  return (
    <KanbanBoard 
      applications={mockApplications}
      onMoveApplication={(id, stage) => console.log(`Move ${id} to ${stage}`)}
    />
  );
}
