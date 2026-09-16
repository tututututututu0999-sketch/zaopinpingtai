import pg from 'pg';
import {migrate} from './migrate.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await migrate(pool);
await pool.end();
await import('../server.js');
