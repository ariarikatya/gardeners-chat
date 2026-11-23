import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireChatUser } from '@/lib/chatAuth';

const VISIBLE_TO_CHAT_ROLES = ['ADMIN', 'LEADER', 'GARDENER', 'CHAT'];

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

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

    if (isChatRole) {
      const orConditions = [
        { role: 'ADMIN' },
        ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
      ];
      // Обходной путь для iPhone/десктопа: поиск по полному номеру (10–11 цифр).
      if (queryDigits.length >= 10 && queryDigits.length <= 11) {
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

    const users = await prisma.user.findMany({
      where: {
        id: { not: auth.user.id },
        role: { in: VISIBLE_TO_CHAT_ROLES },
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, role: true, phone: true, hidePhone: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Ошибка GET /api/chats/users:', error);
    return NextResponse.json({ error: 'Не удалось получить список пользователей' }, { status: 500 });
  }
}
