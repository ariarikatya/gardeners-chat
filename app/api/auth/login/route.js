import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { verifyPassword } from '@/lib/password';
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
    const { phone, password } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Введите номер телефона' }, { status: 400 });
    }

    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      return NextResponse.json({ error: 'Введите номер телефона' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        phone: digits,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Пользователь с таким номером не найден' }, { status: 404 });
    }

    // If user has NOPASS (passwordless), allow login without password
    if (user.passwordHash === 'NOPASS') {
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
    }

    // If password is not provided but user has a password, require password
    if (!password) {
      return NextResponse.json({ error: 'Введите пароль', passwordRequired: true }, { status: 401 });
    }

    // For ADMIN/LEADER, check active session or require password
    if ((user.role === 'ADMIN' || user.role === 'LEADER') && !(await hasActiveSessionForUser(req, user))) {
      if (!user.passwordHash) {
        return NextResponse.json({ error: 'Пароль для аккаунта не настроен' }, { status: 409 });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
      }
    } else {
      // For other roles, verify password if provided
      if (user.passwordHash && !verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
      }
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
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
