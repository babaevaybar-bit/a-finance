#!/usr/bin/env node
// Usage: node scripts/set_admin_password.js email@example.com NewP@ssw0rd
// Requires environment variables:
// SUPABASE_URL (e.g. https://xyz.supabase.co)
// SUPABASE_SERVICE_ROLE_KEY (service_role key from Supabase project settings)

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/set_admin_password.js email@example.com NewP@ssw0rd');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

async function main() {
  try {
    // Try to find user by email
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
    });
    if (!listRes.ok) {
      const txt = await listRes.text();
      throw new Error(`Failed to query users: ${listRes.status} ${txt}`);
    }
    const users = await listRes.json();
    let userId = null;
    if (Array.isArray(users) && users.length > 0) {
      userId = users[0].id;
      console.log('Found existing user id=', userId);
      // update password
      const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, email_confirm: true }),
      });
      const updBody = await upd.json();
      if (!upd.ok) throw new Error(`Failed to update user: ${JSON.stringify(updBody)}`);
      console.log('Password updated for user', email);
    } else {
      console.log('User not found — creating new user');
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const body = await createRes.json();
      if (!createRes.ok) throw new Error(`Failed to create user: ${JSON.stringify(body)}`);
      console.log('User created:', body.id);
      userId = body.id;
    }

    // Upsert admin profile in public.profiles via SQL REST (requires service role key too)
    const sql = `INSERT INTO public.profiles (id, name, role, manager_id, created_at, updated_at) VALUES ('${userId}', 'Admin', 'admin', NULL, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET role='admin', updated_at=NOW();`;
    const sqlRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ sql }),
    });
    // Note: Some projects may not expose RPC endpoint for arbitrary SQL; if this fails, run migration in SQL Editor instead.
    if (!sqlRes.ok) {
      console.warn('Could not run SQL upsert for profile via REST — please run the migration file in Supabase SQL Editor to set admin role.');
    } else {
      console.log('Admin profile upsert attempted via REST.');
    }

    console.log('Done. You can now log in as', email, 'with the provided password.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

main();
