import ReportsDashboard from '../ReportsDashboard';

//todo: remove mock functionality
const mockMetrics = {
  intakesThisMonth: 12,
  intakesYTD: 145,
  adoptionsThisMonth: 15,
  adoptionsYTD: 128,
  avgLengthOfStay: 45,
  totalDonationsThisMonth: 5400,
  totalDonationsYTD: 48200,
  totalExpendituresThisMonth: 4200,
  totalExpendituresYTD: 42100,
  activeFosters: 23,
};

export default function ReportsDashboardExample() {
  return <ReportsDashboard metrics={mockMetrics} />;
}
