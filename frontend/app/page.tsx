import { redirect } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';

export default async function Home() {
  const token = await getTokenServerSide();
  if (token) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
