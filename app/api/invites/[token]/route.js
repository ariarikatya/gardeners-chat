import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const token = params?.token || '';
    const invite = await prisma.chatInvite.findUnique({ where: { token } });
    if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const inviter = await prisma.user.findUnique({
      where: { id: invite.createdById },
      select: { name: true, phone: true },
    });
    return NextResponse.json({
      inviterName: inviter?.name || 'Пользователь',
      phone: invite.phone,
      expired: false,
      used: false,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e && e.message) || e) }, { status: 500 });
  }
}