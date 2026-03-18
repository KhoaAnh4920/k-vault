import { AppDataSource } from './data-source';

const command = process.argv[2];

async function main() {
  const ds = await AppDataSource.initialize();

  if (command === 'run') {
    const ran = await ds.runMigrations();
    console.log(
      `Ran ${ran.length} migration(s):`,
      ran.map((m) => m.name),
    );
  } else if (command === 'revert') {
    await ds.undoLastMigration();
    console.log('Last migration reverted.');
  } else if (command === 'show') {
    await ds.showMigrations();
  } else {
    console.error('Usage: migrate.ts run | revert | show');
    process.exit(1);
  }

  await ds.destroy();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
