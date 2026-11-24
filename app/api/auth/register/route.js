import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { signToken } from '@/lib/jwt';
import { findOrCreateDirectChat } from '@/lib/directChat';
import { normalizePhoneDigits } from '@/lib/phone';

function isRequestSecure(req) {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DISABLE_SECURE_COOKIES === 'true') return false;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl?.protocol || '';
  return proto.includes('https');
}

export async function POST(request) {
  try {
    let body = {};
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else {
      const fd = await request.formData().catch(() => null);
      if (fd) body = { inviteToken: fd.get('inviteToken'), name: fd.get('name'), phone: fd.get('phone'), password: fd.get('password'), avatarDataUrl: fd.get('avatarDataUrl') };
    }
    const { inviteToken, name, phone, password, avatarDataUrl } = body;


    const cleanPhone = normalizePhoneDigits(phone);

    if (!inviteToken || !name || !cleanPhone) {
      return NextResponse.json({ error: 'Заполните имя и номер телефона' }, { status: 400 });
    }

    const invite = await prisma.chatInvite.findUnique({ where: { token: inviteToken } });

    if (!invite || invite.usedAt || new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Приглашение недействительно' }, { status: 404 });
    }

    if (invite.phone !== cleanPhone) {
      return NextResponse.json({ error: 'Приглашение предназначено для другого номера' }, { status: 403 });
    }

    const existingUser = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (existingUser) {
      return NextResponse.json({ error: 'Пользователь с таким номером уже существует — войдите' }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        phone: cleanPhone,
        role: 'CHAT',
        passwordHash: password ? hashPassword(password) : 'NOPASS',
        photo: avatarDataUrl || null,
        hidePhone: true,
      },
    });

    const chat = await findOrCreateDirectChat(invite.createdById, user.id);

    await prisma.chatInvite.update({
      where: { token: inviteToken },
      data: { usedAt: new Date(), chatId: chat.id },
    });

    const token = await signToken({
      userId: user.id,
      phone: user.phone,
      role: user.role,
      gardenerId: user.gardenerId,
    });

    const response = NextResponse.json({ ok: true, chatId: chat.id });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isRequestSecure(req),
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Ошибка POST /api/auth/register:', error);
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
