import Hero from '../Hero';
import heroImage from '@assets/generated_images/Happy_rescued_dogs_with_adopters_9de74d7d.png';

export default function HeroExample() {
  return (
    <Hero 
      rescueName="Sunny Paws Rescue"
      tagline="Saving lives, one paw at a time. Help us find loving homes for animals in need."
      backgroundImage={heroImage}
      onViewAnimals={() => console.log('View animals clicked')}
      onDonate={() => console.log('Donate clicked')}
    />
  );
}
