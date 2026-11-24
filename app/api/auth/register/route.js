import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

function digits(v = '') { return String(v).replace(/\D/g, ''); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || '';
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest();
  return header + '.' + body + '.' + b64url(sig);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const phone = digits(body.phone);
    const password = String(body.password || '');
    const avatar = body.avatarDataUrl || null;
    const inviteToken = String(body.inviteToken || '');
    if (!inviteToken || !name || !phone) {
      return NextResponse.json({ error: 'Заполните имя и номер телефона' }, { status: 400 });
    }
    const invite = await prisma.chatInvite.findUnique({ where: { token: inviteToken } });
    if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Приглашение недействительно' }, { status: 404 });
    }
    if (invite.phone !== phone) {
      return NextResponse.json({ error: 'Приглашение предназначено для другого номера' }, { status: 403 });
    }
    const existing = await prisma.user.findFirst({ where: { phone } });
    if (existing) {
      return NextResponse.json({ error: 'Пользователь с таким номером уже существует — войдите' }, { status: 409 });
    }
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        role: 'CHAT',
        passwordHash: password ? hashPassword(password) : 'NOPASS',
        photo: avatar,
        hidePhone: true,
      },
    });
    const myParts = await prisma.chatParticipant.findMany({
      where: { userId: invite.createdById },
      select: { chatId: true },
    });
    let chat = null;
    if (myParts.length) {
      const candidates = await prisma.chat.findMany({
        where: { id: { in: myParts.map((p) => p.chatId) }, isGroup: false },
        include: { participants: { select: { userId: true } } },
      });
      chat = candidates.find(
        (c) => c.participants.length === 2 && c.participants.some((p) => p.userId === user.id)
      ) || null;
    }
    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          isGroup: false,
          participants: { create: [{ userId: invite.createdById }, { userId: user.id }] },
        },
      });
    }
    await prisma.chatInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), chatId: chat.id },
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signToken({
      userId: user.id,
      role: user.role,
      phone: user.phone,
      iat: now,
      exp: now + 365 * 24 * 3600,
    });
    const res = NextResponse.json({ ok: true, chatId: chat.id });
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 3600,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: String((e && e.message) || e) }, { status: 500 });
  }
}
