import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';

export async function GET(req, { params }) {
  const { token } = params;

  try {
    const invite = await prisma.chatInvite.findUnique({
      where: { token },
      include: {
        chat: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Приглашение не найдено' }, { status: 404 });
    }

    const now = new Date();
    const expired = invite.expiresAt < now;
    const used = Boolean(invite.usedAt);

    return NextResponse.json({
      chatName: invite.chat.name || 'Чат',
      inviterName: invite.createdBy.name,
      phone: invite.phone,
      expired,
      used,
      chatId: invite.chatId,
    });
  } catch (error) {
    console.error('Ошибка GET /api/invites/[token]:', error);
    return NextResponse.json({ error: 'Не удалось получить приглашение' }, { status: 500 });
  }
}