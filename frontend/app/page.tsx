import { redirect } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';

export default function Home() {
  const token = getTokenServerSide();
  if (token) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
