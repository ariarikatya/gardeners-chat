import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireChatUser } from '@/lib/chatAuth';
import { normalizePhoneDigits, phoneContains } from '@/lib/phone';

const VISIBLE_TO_CHAT_ROLES = ['ADMIN', 'LEADER', 'GARDENER', 'CHAT'];

export async function GET(req) {
  const auth = await requireChatUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const searchParams = new URL(req.url).searchParams;
    const query = searchParams.get('q')?.trim().slice(0, 100) || '';
    const phonesParam = searchParams.get('phones') || '';
    const phones = phonesParam
      .split(',')
      .map(normalizePhoneDigits)
      .filter(Boolean);
    const queryDigits = normalizePhoneDigits(query);

    const isChatRole = auth.user.role === 'CHAT';
    const queryLower = query.toLowerCase();

    if (isChatRole) {
      const orConditions = [
        { role: 'ADMIN' },
        ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
      ];
      if (queryDigits.length >= 10 && queryDigits.length <= 15) {
        orConditions.push({ phone: queryDigits });
      }

      const users = await prisma.user.findMany({
        where: {
          id: { not: auth.user.id },
          role: { in: VISIBLE_TO_CHAT_ROLES },
          OR: orConditions,
        },
        select: { id: true, name: true, role: true, phone: true, hidePhone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });

      return NextResponse.json({ users });
    }

    let users;
    if (queryDigits) {
      users = await prisma.user.findMany({
        where: {
          id: { not: auth.user.id },
          role: { in: VISIBLE_TO_CHAT_ROLES },
        },
        select: { id: true, name: true, role: true, phone: true, hidePhone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      users = users.filter(
        (u) => phoneContains(u.phone, queryDigits) || Boolean(u.name && u.name.toLowerCase().includes(queryLower))
      );
    } else if (query) {
      users = await prisma.user.findMany({
        where: {
          id: { not: auth.user.id },
          role: { in: VISIBLE_TO_CHAT_ROLES },
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true, role: true, phone: true, hidePhone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    } else {
      users = await prisma.user.findMany({
        where: {
          id: { not: auth.user.id },
          role: { in: VISIBLE_TO_CHAT_ROLES },
        },
        select: { id: true, name: true, role: true, phone: true, hidePhone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Ошибка GET /api/chats/users:', error);
    return NextResponse.json({ error: 'Не удалось получить список пользователей' }, { status: 500 });
  }
}
