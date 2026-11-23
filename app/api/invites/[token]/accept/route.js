import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const token = req.cookies.get('token')?.value || bearerToken;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return payload.userId;
}

export async function POST(req, { params }) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const { token } = params;

  try {
    const invite = await prisma.chatInvite.findUnique({
      where: { token },
      include: { chat: true },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Приглашение не найдено' }, { status: 404 });
    }

    const now = new Date();
    if (invite.expiresAt < now) {
      return NextResponse.json({ error: 'Приглашение просрочено' }, { status: 400 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: 'Приглашение уже использовано' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const isAdminOrLeader = ['ADMIN', 'LEADER'].includes(user.role);
    if (user.phone !== invite.phone && !isAdminOrLeader) {
      return NextResponse.json({ error: 'Приглашение предназначено для другого номера' }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatParticipant.upsert({
        where: { chatId_userId: { chatId: invite.chatId, userId } },
        update: { hiddenAt: null },
        create: { chatId: invite.chatId, userId },
      });
      await tx.chatInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      });
      await tx.chat.update({ where: { id: invite.chatId }, data: { updatedAt: new Date() } });
    });

    return NextResponse.json({ chatId: invite.chatId });
  } catch (error) {
    console.error('Ошибка POST /api/invites/[token]/accept:', error);
    return NextResponse.json({ error: 'Не удалось принять приглашение' }, { status: 500 });
  }
}