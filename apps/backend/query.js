const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const v = await prisma.video.findFirst({
    where: { status: 'READY' },
    select: { id: true, title: true }
  });
  console.log(v ? v.id : 'None');
}
main().catch(console.error).finally(() => prisma.$disconnect());
