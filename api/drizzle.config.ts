import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        database: process.env.DB_NAME ?? 'openpath',
        user: process.env.DB_USER ?? 'openpath',
        password: process.env.DB_PASSWORD ?? 'openpath_dev',
        ssl: false,
    tablesFilter: [
        'users',
        'roles',
        'requests',
        'classrooms',
        'machines',
        'schedules',
        'tokens',
        'settings',
        'password_reset_tokens',
        'push_subscriptions',
        'health_reports',
        'whitelist_groups',
        'whitelist_rules',
        'dashboard_users',
    ],
});
