import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { hasActiveSessionForUser } from '@/lib/authSession';
import { normalizePhoneDigits } from '@/lib/phone';

function isRequestSecure(req) {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DISABLE_SECURE_COOKIES === 'true') return false;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl?.protocol || '';
  return proto.includes('https');
}

export async function POST(req) {
  try {
    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Введите номер телефона' }, { status: 400 });
    }

    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      return NextResponse.json({ error: 'Введите номер телефона' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { phone: digits },
    });

    if (!user) {
      return NextResponse.json({ error: 'Пользователь с таким номером не найден' }, { status: 401 });
    }

    if ((user.role === 'ADMIN' || user.role === 'LEADER') && !(await hasActiveSessionForUser(req, user))) {
      return NextResponse.json({ requiresPassword: true }, { status: 401 });
    }

    const token = await signToken({
      userId: user.id,
      phone: user.phone,
      role: user.role,
      gardenerId: user.gardenerId,
    });

    const response = NextResponse.json({
      success: true,
      role: user.role,
      token,
      name: user.name || null,
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isRequestSecure(req),
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Auto-login error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
