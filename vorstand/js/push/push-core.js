// vorstand/js/push/push-core.js
// ==============================================================================
//  PUSH-MITTEILUNGEN - Core Service & Datenanbindung
// ==============================================================================

const PushCore = {
  EDGE_FUNCTION_URL: 'https://supabase-muhen.danfamily.uk/functions/v1/send-push-notification',

  getClient() {
    return typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
  },

  async getAudienceStats() {
    const supa = this.getClient();
    if (!supa) throw new Error('Supabase Client nicht verfügbar.');

    const { data, error } = await supa.rpc('get_push_audience_stats');
    if (error) {
      console.warn('Konnte get_push_audience_stats nicht laden:', error);
      return {
        total_members: 0,
        active_members: 0,
        passive_members: 0,
        board_members: 0,
        total_with_push: 0,
        active_with_push: 0,
        passive_with_push: 0,
        board_with_push: 0
      };
    }
    return data;
  },

  async getSubscribersList() {
    const supa = this.getClient();
    if (!supa) return [];

    // Alle Mitglieder laden
    const { data: members, error: mErr } = await supa
      .from('members')
      .select('person_number, first_name, last_name, is_active, is_passive')
      .eq('is_active', true)
      .eq('deceased', false)
      .order('last_name', { ascending: true });

    if (mErr || !members) return [];

    // Vorstands-Personennummern laden
    const { data: admins } = await supa
      .from('admin_profiles')
      .select('person_number')
      .eq('is_active', true);

    const boardPns = new Set((admins || []).map(a => a.person_number).filter(Boolean));

    // Abonnements laden
    const { data: subs } = await supa
      .from('push_subscriptions')
      .select('person_number, device_type, permission_status, last_active_at');

    const subMap = new Map();
    (subs || []).forEach(s => {
      subMap.set(s.person_number, s);
    });

    return members.map(m => {
      const sub = subMap.get(m.person_number);
      const isBoard = boardPns.has(m.person_number);
      return {
        person_number: m.person_number,
        name: `${m.last_name || ''} ${m.first_name || ''}`.trim(),
        vorname: m.first_name || '',
        nachname: m.last_name || '',
        personenkreis: m.is_passive ? 'passiv' : 'aktiv',
        is_board: isBoard,
        has_push: Boolean(sub && sub.permission_status === 'granted'),
        device_type: sub ? sub.device_type : '–',
        last_active: sub ? sub.last_active_at : null
      };
    });
  },

  async getHistory(limit = 50) {
    const supa = this.getClient();
    if (!supa) return [];

    const { data, error } = await supa
      .from('push_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Konnte push_notifications History nicht laden:', error);
      return [];
    }
    return data || [];
  },

  async getSettings() {
    const supa = this.getClient();
    if (!supa) return { appId: '', restApiKey: '' };

    const { data } = await supa
      .from('system_app_configs')
      .select('key, value')
      .in('key', ['onesignal_app_id', 'onesignal_rest_api_key']);

    let appId = '1a084ef4-4d8e-4be1-9df5-115f6168cdb4';
    let restApiKey = '';

    (data || []).forEach(c => {
      if (c.key === 'onesignal_app_id' && c.value) appId = c.value;
      if (c.key === 'onesignal_rest_api_key' && c.value) restApiKey = c.value;
    });

    return { appId, restApiKey };
  },

  async saveSettings(appId, restApiKey) {
    const supa = this.getClient();
    if (!supa) throw new Error('Supabase Client nicht verfügbar.');

    if (appId) {
      await supa.from('system_app_configs').upsert({
        key: 'onesignal_app_id',
        value: appId.trim(),
        description: 'OneSignal App ID für Sportschützen Muhen Web-App & Portal',
        category: 'onesignal',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    }

    if (typeof restApiKey === 'string') {
      await supa.from('system_app_configs').upsert({
        key: 'onesignal_rest_api_key',
        value: restApiKey.trim(),
        description: 'OneSignal REST API Key für serverseitigen Push-Versand',
        category: 'onesignal',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    }

    return true;
  },

  async sendPushNotification(payload) {
    const session = (typeof window.getAuthSession === 'function') ? window.getAuthSession() : null;
    const token = session?.access_token || '';

    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(this.EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Fehler beim Senden der Push-Mitteilung.');
    }
    return data;
  }
};

window.PushCore = PushCore;
