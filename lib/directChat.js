import { prisma } from '@/lib/prisma';

export async function findOrCreateDirectChat(meId, otherId) {
  const myParts = await prisma.chatParticipant.findMany({
    where: { userId: meId },
    select: { chatId: true },
  });
  let chat = null;
  if (myParts.length) {
    const candidates = await prisma.chat.findMany({
      where: { id: { in: myParts.map((p) => p.chatId) }, isGroup: false },
      include: { participants: { select: { userId: true } } },
    });
    chat = candidates.find(
      (c) => c.participants.length === 2 && c.participants.some((p) => p.userId === otherId)
    ) || null;
  }
  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        isGroup: false,
        participants: { create: [{ userId: meId }, { userId: otherId }] },
      },
      include: { participants: { select: { userId: true } } },
    });
  } else if (!chat.participants.some((p) => p.userId === otherId)) {
    await prisma.chatParticipant.create({ data: { chatId: chat.id, userId: otherId } });
  }
  return chat;
}