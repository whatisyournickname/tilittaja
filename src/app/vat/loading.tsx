import PageLoadingState from '@/components/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      eyebrow="VAT"
      title="Loading VAT view"
      description="Lasketaan ALV-raportti, tilitys ja aiemmat ilmoitukset."
    />
  );
}
