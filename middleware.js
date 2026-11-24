import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/login' ||
    pathname.startsWith('/invite') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/emergency.js' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icon')
  ) {
    return NextResponse.next();
  }
  const token = request.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  try {
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  } catch (e) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
