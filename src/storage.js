import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fiuaukzcsuinakgevpaf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ysJvVRXGuQA4WeIMim7OxA_40_96VAa';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE = 'app_storage';

window.storage = {
  async get(key) {
    const { data, error } = await supabase
      .from(TABLE).select('value').eq('key', key).maybeSingle();
    if (error) { console.error('storage.get', error); return null; }
    return data ? { key, value: data.value, shared: true } : null;
  },

  async set(key, value) {
    const { error } = await supabase
      .from(TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { console.error('storage.set', error); return null; }
    return { key, value, shared: true };
  },

  async delete(key) {
    const { error } = await supabase.from(TABLE).delete().eq('key', key);
    if (error) { console.error('storage.delete', error); return null; }
    return { key, deleted: true, shared: true };
  },

  async list(prefix = '') {
    let q = supabase.from(TABLE).select('key');
    if (prefix) q = q.like('key', prefix + '%');
    const { data, error } = await q;
    if (error) { console.error('storage.list', error); return { keys: [], prefix, shared: true }; }
    return { keys: data.map(r => r.key), prefix, shared: true };
  },
};