import AnimalCard from '../AnimalCard';
import catPhoto from '@assets/generated_images/Orange_tabby_cat_portrait_ef061c39.png';

export default function AnimalCardExample() {
  return (
    <div className="max-w-sm">
      <AnimalCard 
        id="1"
        name="Whiskers"
        species="Cat"
        breed="Domestic Shorthair"
        age="2 years"
        photo={catPhoto}
        bio="Sweet and playful orange tabby looking for a loving home. Great with kids and other pets!"
        onAdopt={() => console.log('Adopt clicked')}
        onSponsor={() => console.log('Sponsor clicked')}
      />
    </div>
  );
}
