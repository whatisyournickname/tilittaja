import PageLoadingState from '@/components/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      eyebrow="Bank statements"
      title="Loading bank statements"
      description="Fetching bank statements, processing state, and links."
    />
  );
}
