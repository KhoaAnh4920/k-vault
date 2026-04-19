import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Multi-Tenant RBAC Schema
 *
 * Changes:
 * 1. Extend `visibility` enum → adds 'unlisted', 'role_restricted'
 * 2. Extend `status` enum → adds 'waiting'
 * 3. Add `share_token` column (VARCHAR 64, nullable, unique)
 *
 * Safe to run on existing data — all new values are nullable/additive.
 */
export class MultiTenantRBAC1745000000000 implements MigrationInterface {
  name = 'MultiTenantRBAC1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Extend `videos_visibility_enum` ──────────────────────────────────
    // Postgres requires ALTER TYPE to add new values (cannot modify existing ones)
    await queryRunner.query(
      `ALTER TYPE "public"."videos_visibility_enum" ADD VALUE IF NOT EXISTS 'unlisted'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."videos_visibility_enum" ADD VALUE IF NOT EXISTS 'role_restricted'`,
    );

    // ── 2. Extend `videos_status_enum` ─────────────────────────────────────
    await queryRunner.query(
      `ALTER TYPE "public"."videos_status_enum" ADD VALUE IF NOT EXISTS 'waiting'`,
    );

    // ── 3. Add `share_token` column ────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "share_token" VARCHAR(64) DEFAULT NULL`,
    );

    // Unique index (sparse — only enforces uniqueness on non-null values)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_videos_share_token"
       ON "videos" ("share_token")
       WHERE "share_token" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Drop share_token index and column ─────────────────────────────────
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_videos_share_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "share_token"`,
    );

    // ── NOTE: Postgres does NOT support removing enum values ──────────────
    // The 'waiting', 'unlisted', 'role_restricted' values cannot be removed
    // without recreating the enum type. Omitting this to avoid data loss risk.
    // If a full rollback is needed, restore from a DB snapshot.
  }
}
