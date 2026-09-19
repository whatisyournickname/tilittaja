import PageLoadingState from '@/components/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      eyebrow="Reports"
      title="Loading report"
      description="Calculating report rows, comparison data, and details."
    />
  );
}
