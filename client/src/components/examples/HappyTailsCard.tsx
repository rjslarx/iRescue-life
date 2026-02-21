import HappyTailsCard from '../HappyTailsCard';
import dogPhoto from '@assets/generated_images/Golden_retriever_dog_portrait_fdeb8a78.png';

//todo: remove mock functionality
const mockTail = {
  id: "1",
  animalName: "Max",
  adopterName: "The Johnson Family",
  story: "Max came to us as a scared, shy pup who had been living on the streets. After months in foster care with our amazing volunteer Sarah, he blossomed into the confident, playful dog he was meant to be. The Johnsons fell in love with him at our adoption event, and now he's living his best life with two kids and a big backyard to run in!",
  photo: dogPhoto,
  date: "December 2023",
};

export default function HappyTailsCardExample() {
  return (
    <div className="max-w-sm">
      <HappyTailsCard tail={mockTail} />
    </div>
  );
}
