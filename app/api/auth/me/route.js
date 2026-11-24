import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { hashPassword, verifyPassword } from '@/lib/password';
import { normalizePhoneDigits } from '@/lib/phone';

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const token = req.cookies.get('token')?.value || bearerToken;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return payload.userId;
}

export async function GET(req) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, name: true, role: true, gardenerId: true, notifPermission: true, notificationsEnabled: true, hidePhone: true }
    });
    if (!user) return NextResponse.json({ user: null });
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Ошибка GET /api/auth/me:', error);
    return NextResponse.json({ error: 'Не удалось получить пользователя' }, { status: 500 });
  }
}

export async function PATCH(req) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, phone, currentPassword, newPassword, hidePhone } = body;

    const updateData = {};
    if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
    if (typeof phone === 'string') {
      const normalizedPhone = normalizePhoneDigits(phone);
      if (normalizedPhone) updateData.phone = normalizedPhone;
    }
    if (typeof hidePhone === 'boolean') updateData.hidePhone = hidePhone;

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Введите текущий пароль' }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Новый пароль должен быть не короче 6 символов' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
      if (!user?.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
        return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 });
      }
      updateData.passwordHash = hashPassword(newPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Нет данных для обновления' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, phone: true, name: true, role: true, gardenerId: true, notifPermission: true, notificationsEnabled: true, hidePhone: true }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Ошибка PATCH /api/auth/me:', error);
    return NextResponse.json({ error: 'Не удалось обновить профиль' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: 'Введите пароль для подтверждения' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Неверный пароль' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const participantChats = await tx.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true },
      });

      for (const { chatId } of participantChats) {
        const otherParticipants = await tx.chatParticipant.count({
          where: { chatId, userId: { not: userId } },
        });

        if (otherParticipants === 0) {
          const messages = await tx.chatMessage.findMany({
            where: { chatId },
            select: { id: true },
          });

          const messageIds = messages.map((m) => m.id);

          if (messageIds.length > 0) {
            const attachments = await tx.chatAttachment.findMany({
              where: { messageId: { in: messageIds } },
              select: { storagePath: true },
            });

            for (const { storagePath } of attachments) {
              try {
                const fs = await import('fs');
                if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
              } catch (e) {}
            }

            await tx.chatAttachment.deleteMany({ where: { messageId: { in: messageIds } } });
            await tx.chatMessageRead.deleteMany({ where: { messageId: { in: messageIds } } });
            await tx.chatMessage.deleteMany({ where: { chatId } });
          }

          await tx.chatParticipant.deleteMany({ where: { chatId } });
          await tx.chat.delete({ where: { id: chatId } });
        }
      }

      await tx.chatParticipant.deleteMany({ where: { userId } });
      await tx.chatMessageRead.deleteMany({ where: { userId } });

      const sentMessages = await tx.chatMessage.findMany({
        where: { senderId: userId },
        select: { id: true },
      });
      const sentMessageIds = sentMessages.map((m) => m.id);

      if (sentMessageIds.length > 0) {
        const attachments = await tx.chatAttachment.findMany({
          where: { messageId: { in: sentMessageIds } },
          select: { storagePath: true },
        });

        for (const { storagePath } of attachments) {
          try {
            const fs = await import('fs');
            if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
          } catch (e) {}
        }

        await tx.chatAttachment.deleteMany({ where: { messageId: { in: sentMessageIds } } });
      }

      await tx.chatMessage.deleteMany({ where: { senderId: userId } });

      await tx.user.delete({ where: { id: userId } });
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error('Ошибка DELETE /api/auth/me:', error);
    return NextResponse.json({ error: 'Не удалось удалить аккаунт' }, { status: 500 });
  }
}
