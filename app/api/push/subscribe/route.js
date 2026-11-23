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

export async function POST(req) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { endpoint, p256dh, auth } = body;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Некорректные данные подписки' }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth, userId },
      create: { endpoint, p256dh, auth, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Ошибка POST /api/push/subscribe:', error);
    return NextResponse.json({ error: 'Не удалось сохранить подписку' }, { status: 500 });
  }
}