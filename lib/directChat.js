import prisma from '@/lib/prisma';

export async function findOrCreateDirectChat(tx, meId, otherId) {
  const prismaClient = tx || prisma;

  const memberships = await prismaClient.chatParticipant.findMany({
    where: { userId: meId },
    include: {
      chat: {
        where: { isGroup: false },
        include: { participants: { select: { userId: true } } },
      },
    },
  });

  const direct = memberships.find(
    (membership) =>
      membership.chat &&
      membership.chat.participants.length === 2 &&
      membership.chat.participants.some((participant) => participant.userId === otherId)
  );

  if (direct) return direct.chat.id;

  const chat = await prismaClient.chat.create({
    data: {
      isGroup: false,
      participants: {
        create: [{ userId: meId }, { userId: otherId }],
      },
    },
  });

  return chat.id;
}
