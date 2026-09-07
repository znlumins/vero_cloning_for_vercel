/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty */
// lib/db.ts
// Client-side Database Mock Layer (phpMyAdmin / Local MySQL Laragon)
// Menerjemahkan kueri client-side ke MySQL backend lokal (API Routes) secara transparan.

// Sertakan token sesi (dari localStorage, diisi saat login) di tiap request ke
// API. Server memverifikasi tanda tangannya sebelum mengeksekusi apa pun.
function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const s = localStorage.getItem('db_mock_session');
    if (s) {
      const token = JSON.parse(s)?.access_token;
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

function clearStoredSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('db_mock_session');
  localStorage.removeItem('db_mock_user');
}

class DBQueryBuilder {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private filters: { type: string; column: string; value: any }[] = [];
  private orderField: string = '';
  private orderAscending: boolean = true;

  constructor(table: string) {
    this.table = table;
  }

  select(fields: string = '*') {
    this.action = 'select';
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.payload = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  upsert(data: any) {
    this.action = 'upsert';
    this.payload = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  or(filterString: string) {
    this.filters.push({ type: 'or', column: '', value: filterString });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderField = column;
    this.orderAscending = options?.ascending !== false;
    return this;
  }

  single() {
    this.filters.push({ type: 'single', column: '', value: null });
    return this;
  }

  limit(num: number) {
    return this;
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          payload: this.payload,
          filters: this.filters,
          orderField: this.orderField,
          orderAscending: this.orderAscending
        })
      });
      if (response.status === 401) {
        // Token hilang/kedaluwarsa. Bersihkan sesi basi supaya getUser()
        // mengembalikan null dan halaman mengarahkan ke /login, bukan diam
        // menampilkan data kosong tanpa penjelasan.
        clearStoredSession();
      }
      return await response.json();
    } catch (err) {
      console.error("Database mock client error: ", err);
      return { data: null, error: err };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class DBChannelMock {
  private channelName: string;
  private callbacks: ((payload?: any) => void)[] = [];
  private intervalId: any = null;

  constructor(channelName: string) {
    this.channelName = channelName;
  }

  on(event: string, filter: any, callback: (payload?: any) => void) {
    this.callbacks.push(callback);
    return this;
  }

  subscribe(intervalMs: number = 2500) {
    // Ini BUKAN realtime sungguhan — database di-polling untuk menirunya.
    //
    // Riwayat: awalnya 3 detik, lalu dinaikkan ke 10 detik untuk menekan beban
    // server. Tapi yang bikin berat bukan intervalnya, melainkan callback-nya:
    // di halaman diskusi, tiap denyut menarik pesan + daftar user + keanggotaan
    // grup + daftar grup sekaligus (EMPAT query). Jadi memperlambat interval
    // mengobati gejala, sambil membuat pesan lawan bicara telat sampai 10 detik
    // — yang terasa seperti "chat tidak masuk".
    //
    // Setelah callback-nya dirampingkan jadi satu query (hanya pesan pada
    // percakapan yang sedang dibuka), 2,5 detik justru membebani server LEBIH
    // RINGAN daripada 10 detik versi lama, tapi 4x lebih responsif.
    this.intervalId = setInterval(() => {
      this.callbacks.forEach(cb => {
        try { cb({ eventType: 'INSERT', new: {} }); } catch (e) {}
      });
    }, intervalMs);
    return this;
  }

  unsubscribe() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

const mockAuth = {
  async signUp({ email, password, options }: any) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signUp', email, password, options })
      });
      return await response.json();
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async signInWithPassword({ email, password }: any) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signIn', email, password })
      });
      const result = await response.json();
      if (!result.error && typeof window !== 'undefined') {
        localStorage.setItem('db_mock_session', JSON.stringify(result.data.session));
        localStorage.setItem('db_mock_user', JSON.stringify(result.data.user));
      }
      return result;
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async getUser() {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('db_mock_user');
      if (userStr) {
        return { data: { user: JSON.parse(userStr) }, error: null };
      }
    }
    return { data: { user: null }, error: null };
  },

  async signOut() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('db_mock_session');
      localStorage.removeItem('db_mock_user');
    }
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signOut' })
      });
      return await response.json();
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async updateUser(attributes: any) {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('db_mock_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (attributes.data) {
          user.user_metadata = { ...user.user_metadata, ...attributes.data };
          localStorage.setItem('db_mock_user', JSON.stringify(user));
          
          // Also update session
          const sessionStr = localStorage.getItem('db_mock_session');
          if (sessionStr) {
            const session = JSON.parse(sessionStr);
            session.user = user;
            localStorage.setItem('db_mock_session', JSON.stringify(session));
          }
        }
        
        if (attributes.password) {
          try {
            const response = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'updateUser', password: attributes.password, userId: user.id })
            });
            const result = await response.json();
            if (result.error) return { data: null, error: result.error };
          } catch (err) {
            return { data: null, error: err };
          }
        }
        
        return { data: { user }, error: null };
      }
    }
    return { data: null, error: new Error("User not found or localStorage not available") };
  }
};

const uploadedUrls = new Map<string, string>();

const mockStorage = {
  from(bucket: string) {
    return {
      async upload(filePath: string, file: any) {
        try {
          if (file instanceof File || file instanceof Blob) {
            const formData = new FormData();
            formData.append('file', file);
            
            const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { ...authHeader() },
              body: formData
            });
            const data = await res.json();
            
            if (data.url) {
              // Store the permanent URL mapping
              uploadedUrls.set(filePath, data.url);
              return { data: { path: filePath, fullPath: data.url }, error: null };
            }
          }
        } catch (e) {
          console.error("Storage error:", e);
        }
        return { data: null, error: new Error("Failed to upload") };
      },
      getPublicUrl(filePath: string) {
        // Return the saved URL or the filePath directly if it's already an absolute path
        let url = uploadedUrls.get(filePath);
        if (!url) {
          // Fallback if not in memory (e.g., after refresh, but DB has the path)
          // Wait, if the DB saved the raw URL from the API, it's fine.
          // But usually apps save 'path'. Let's return the path if it starts with /uploads/
          if (filePath.startsWith('/uploads/')) {
            url = filePath;
          } else if (filePath.startsWith('http')) {
            url = filePath;
          } else {
            url = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80`;
          }
        }
        return { data: { publicUrl: url } };
      }
    };
  }
};

export const db = {
  from(table: string) {
    return new DBQueryBuilder(table);
  },
  auth: mockAuth,
  storage: mockStorage,
  channel(channelName: string) {
    return new DBChannelMock(channelName);
  },
  removeChannel(channel: any) {
    if (channel && typeof channel.unsubscribe === 'function') {
      channel.unsubscribe();
    }
  }
};
