import StatsCard from '../StatsCard';
import { Heart } from 'lucide-react';

export default function StatsCardExample() {
  return (
    <div className="max-w-sm">
      <StatsCard 
        title="Animals Adopted"
        value={42}
        icon={Heart}
        trend={{ value: 12, isPositive: true }}
      />
    </div>
  );
}
