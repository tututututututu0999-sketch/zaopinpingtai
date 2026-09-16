import {readFile} from 'node:fs/promises';
import {inferMaterialType} from '../visual-rules/asset-filename.mjs';
export async function migrate(pool) {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260908)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const name='02-visual-rules';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rowCount) {
   await client.query(await readFile(new URL('../prisma/migrations/02-visual-rules.sql',import.meta.url),'utf8'));
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
  }
  const reviewMigration='03-filename-review-defaults';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[reviewMigration])).rowCount) {
   await client.query("ALTER TABLE assets ALTER COLUMN reuse_state SET DEFAULT 'REUSABLE'");
   // Only untouched AI candidates: never change confirmed fields or reopened human reviews.
   const candidates=(await client.query("SELECT a.id,a.filename,a.material_type FROM assets a WHERE a.review_state='PENDING' AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.asset_id=a.id) FOR UPDATE")).rows;
   for(const asset of candidates)await client.query("UPDATE assets SET material_type=$2,reuse_state='REUSABLE',updated_at=now() WHERE id=$1",[asset.id,inferMaterialType(asset.filename,asset.material_type)]);
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[reviewMigration]);
  }
  const referenceMigration='04-reference-roles';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[referenceMigration])).rowCount) {
   await client.query("ALTER TABLE design_task_references ADD COLUMN role TEXT NOT NULL DEFAULT 'style' CHECK(role IN ('character','style','layout')), ADD COLUMN note TEXT NOT NULL DEFAULT ''");
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[referenceMigration]);
  }
  const branchMigration='05-upload-reference-branch';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[branchMigration])).rowCount) {
   await client.query("ALTER TABLE design_tasks ADD COLUMN reference_source TEXT NOT NULL DEFAULT 'catalog' CHECK(reference_source IN ('catalog','upload')), ADD COLUMN reference_revision INTEGER NOT NULL DEFAULT 0, ADD COLUMN upload_reference_snapshot JSONB NOT NULL DEFAULT '[]'");
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[branchMigration]);
  }
  const modelMigration='06-task-text-model';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[modelMigration])).rowCount) {
   await client.query('ALTER TABLE design_tasks ADD COLUMN text_model TEXT');
   await client.query('CREATE TABLE text_model_checks(model_id TEXT PRIMARY KEY,result JSONB NOT NULL)');
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[modelMigration]);
  }
  const noReferenceMigration='07-no-reference-branch';
  if (!(await client.query('SELECT name FROM schema_migrations WHERE name=$1',[noReferenceMigration])).rowCount) {
   await client.query("ALTER TABLE design_tasks DROP CONSTRAINT design_tasks_reference_source_check");
   await client.query("ALTER TABLE design_tasks ADD CONSTRAINT design_tasks_reference_source_check CHECK(reference_source IN ('catalog','upload','none'))");
   await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[noReferenceMigration]);
  }
  await client.query(`CREATE TABLE IF NOT EXISTS image_edit_references (
   id UUID PRIMARY KEY,task_id UUID NOT NULL REFERENCES design_tasks(id) ON DELETE CASCADE,
   object_key TEXT NOT NULL,filename TEXT NOT NULL,mime_type TEXT NOT NULL,
   role TEXT NOT NULL CHECK(role IN ('character','style','layout')),note TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await client.query('COMMIT');
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
