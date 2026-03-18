import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerThumbnailColumns1710000000000 implements MigrationInterface {
  name = 'AddOwnerThumbnailColumns1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // thumbnail_drive_file_id
    await queryRunner.query(`
      ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "thumbnail_drive_file_id" VARCHAR
    `);

    // source_height
    await queryRunner.query(`
      ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "source_height" INTEGER
    `);

    // owner_id
    await queryRunner.query(`
      ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "owner_id" VARCHAR
    `);

    // is_private — has a non-null default so needs two steps on existing rows
    await queryRunner.query(`
      ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT true
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "is_private"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "source_height"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "thumbnail_drive_file_id"`,
    );
  }
}
