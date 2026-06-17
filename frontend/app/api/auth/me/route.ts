import { NextResponse } from 'next/server';
import { getTokenServerSide, getCurrentUser } from '@/lib/auth';

export async function GET() {
  const token = await getTokenServerSide();
  if (!token) return NextResponse.json(null);
  const user = await getCurrentUser(token);
  return NextResponse.json(user);
}
