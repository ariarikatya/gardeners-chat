import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { randomUUID } from 'crypto';
import { findOrCreateDirectChat } from '@/lib/directChat';
import { normalizePhoneDigits } from '@/lib/phone';

async function getUserFromRequest(req) {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return payload.userId;
}

export async function POST(req) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const phone = normalizePhoneDigits(typeof body.phone === 'string' ? body.phone : '');
    if (!phone) return NextResponse.json({ error: 'Укажите номер телефона' }, { status: 400 });

    const existingUser = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existingUser) {
      const chat = await findOrCreateDirectChat(userId, existingUser.id);
      return NextResponse.json({ existing: true, chatId: chat.id });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = randomUUID();
    await prisma.chatInvite.create({
      data: {
        chatId: null,
        phone,
        token,
        createdById: userId,
        expiresAt,
      },
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Ошибка POST /api/invites:', error);
    return NextResponse.json({ error: 'Не удалось создать приглашение' }, { status: 500 });
  }
}
