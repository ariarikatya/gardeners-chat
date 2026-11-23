import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireChatUser } from '@/lib/chatAuth';
import { randomUUID } from 'crypto';

export async function POST(req, { params }) {
  const auth = await requireChatUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    if (!phone) return NextResponse.json({ error: 'Укажите номер телефона' }, { status: 400 });

    const membership = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId: params.chatId, userId: auth.user.id } },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });

    const existingUser = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true },
    });

    if (existingUser) {
      const alreadyInChat = await prisma.chatParticipant.findUnique({
        where: { chatId_userId: { chatId: params.chatId, userId: existingUser.id } },
      });
      if (alreadyInChat) {
        return NextResponse.json({ error: 'Уже в чате' }, { status: 409 });
      }
      await prisma.chatParticipant.create({
        data: { chatId: params.chatId, userId: existingUser.id },
      });
      await prisma.chat.update({ where: { id: params.chatId }, data: { updatedAt: new Date() } });
      return NextResponse.json({ addedExisting: true });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = randomUUID();
    await prisma.chatInvite.create({
      data: {
        chatId: params.chatId,
        phone,
        token,
        createdById: auth.user.id,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (req.headers.get('origin') || '');
    const url = `${baseUrl}/invite/${token}`;
    return NextResponse.json({ token, url });
  } catch (error) {
    console.error('Ошибка POST /api/chats/[chatId]/invites:', error);
    return NextResponse.json({ error: 'Не удалось создать приглашение' }, { status: 500 });
  }
}