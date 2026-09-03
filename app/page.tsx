import Dashboard from '@/components/Dashboard';
import SectionErrorBoundary from '@/components/SectionErrorBoundary';

export default function Page() {
  return (
    <SectionErrorBoundary name="Dashboard" fullPage>
      <Dashboard />
    </SectionErrorBoundary>
  );
}
