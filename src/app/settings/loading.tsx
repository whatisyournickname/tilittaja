import PageLoadingState from '@/components/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      eyebrow="Settings"
      title="Loading settings"
      description="Fetching company info, fiscal years, and system settings."
    />
  );
}
