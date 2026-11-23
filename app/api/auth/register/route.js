import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { signToken } from '@/lib/jwt';

export async function POST(req) {
  try {
    const body = await req.json();
    const { name, phone, password, inviteToken } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Укажите имя' }, { status: 400 });
    }
    const normalizedPhone = phone?.replace(/\D/g, '');
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json({ error: 'Укажите корректный номер телефона' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Пароль должен быть не короче 6 символов' }, { status: 400 });
    }

    let chatId = null;
    let inviterName = null;

    if (inviteToken) {
      const invite = await prisma.chatInvite.findUnique({
        where: { token: inviteToken },
        include: { chat: true, createdBy: { select: { name: true } } },
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
      if (invite.phone !== normalizedPhone) {
        return NextResponse.json({ error: 'Приглашение предназначено для другого номера' }, { status: 400 });
      }

      chatId = invite.chatId;
      inviterName = invite.createdBy.name;
    }

    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json({ error: 'Пользователь с таким номером уже существует' }, { status: 409 });
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          phone: normalizedPhone,
          passwordHash,
          role: 'CHAT',
        },
        select: { id: true, name: true, phone: true, role: true },
      });

      if (chatId) {
        await tx.chatParticipant.create({
          data: { chatId, userId: newUser.id },
        });
        await tx.chatInvite.update({
          where: { token: inviteToken },
          data: { usedAt: new Date() },
        });
        await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      }

      return newUser;
    });

    const token = await signToken({ userId: user.id, role: user.role });

    const response = NextResponse.json({ user });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error('Ошибка POST /api/auth/register:', error);
    return NextResponse.json({ error: 'Не удалось зарегистрироваться' }, { status: 500 });
  }
}