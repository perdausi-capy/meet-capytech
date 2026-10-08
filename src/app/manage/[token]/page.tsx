import { ManageFlow } from '@/components/booking/ManageFlow';

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManageFlow initialToken={token} />;
}
