import PageLoadingState from '@/components/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      eyebrow="Documents"
      title="Loading documents"
      description="Fetching period documents, entries, and attachments."
    />
  );
}
