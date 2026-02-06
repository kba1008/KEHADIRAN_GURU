// sw.js - Versi Ultra-Offline v45 dengan Background Mode & Geofencing
const CACHE_NAME = 'ehadir-v45';
const DB_NAME = 'E-Hadir-Offline-DB';
const STORE_NAME = 'attendance_queue';
const GEOLOCATION_PERMISSION = 'geolocation';
const NOTIFICATION_PERMISSION = 'notifications';
const BACKGROUND_SYNC_PERMISSION = 'background-sync';

// Pastikan SEMUA fail (CSS/JS) didaftarkan di sini supaya app tak 'pecah' masa offline
const assetsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  './background-geofencing.js', // Script untuk geofencing background
  './permission-handler.js'      // Script untuk handle permissions
];

// Install: Simpan aset 'seketul' dalam telefon
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache).catch((err) => {
        console.warn('Some assets failed to cache:', err);
      });
    })
  );
});

// Activate: Bersihkan cache lama dan setup background features
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim clients immediately for background features
      return self.clients.claim();
    })
  );
});

// Fetch: Strategi Cache-First untuk aset agar laju
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        // Jika POST gagal (offline), kita return JSON offline
        // Data sebenar disimpan di localStorage client-side (index.html)
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Navigasi sentiasa ke index.html jika offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((res) => res || fetch(request))
  );
});

// Background Sync (Hanya Android/Chrome sokong penuh buat masa ini)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    console.log("Background Sync Triggered!");
    event.waitUntil(syncAttendanceData());
  }
  
  if (event.tag === 'geofence-check') {
    console.log("Geofence Check Triggered!");
    event.waitUntil(checkGeofenceLocations());
  }
});

// Periodic Background Sync (untuk sync berkala)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-attendance-sync') {
    console.log("Periodic Sync Triggered!");
    event.waitUntil(syncAttendanceData());
  }
});

// Background Fetch untuk attendance data yang besar
self.addEventListener('backgroundfetch', (event) => {
  const bgFetch = event.registration;
  
  event.waitUntil(
    (async () => {
      try {
        const records = await bgFetch.matchAll();
        const promises = records.map(async (record) => {
          const response = await fetch(record.request);
          const cache = await caches.open('attendance-cache');
          await cache.put(record.request, response.clone());
          await record.done(response);
        });
        
        await Promise.all(promises);
        bgFetch.updateUI({ title: 'Attendance synced successfully!' });
      } catch (error) {
        bgFetch.updateUI({ title: 'Sync failed. Will retry.' });
        throw error;
      }
    })()
  );
});

// Push Notification untuk background events
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Attendance notification',
    icon: './logo.png',
    badge: './logo.png',
    data: data,
    actions: [
      {
        action: 'view',
        title: 'View Attendance'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'E-Hadir', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('./index.html')
    );
  }
});

// Fungsi untuk sync attendance data
async function syncAttendanceData() {
  try {
    // Dapatkan clients yang aktif
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    
    // Hantar message ke semua clients untuk sync
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_SYNC_REQUESTED',
        timestamp: Date.now()
      });
    });
    
    console.log('Attendance sync initiated from background');
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Fungsi untuk check geofence locations
async function checkGeofenceLocations() {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    
    clients.forEach(client => {
      client.postMessage({
        type: 'GEOFENCE_CHECK_REQUESTED',
        timestamp: Date.now()
      });
    });
    
    console.log('Geofence check initiated from background');
  } catch (error) {
    console.error('Geofence check failed:', error);
  }
}

// Setup geofencing (experimental - browser support varies)
async function setupGeofencing() {
  try {
    // Check if geofencing API is available
    if ('geofencing' in navigator) {
      console.log('Geofencing API available');
      
      // Define geofence regions (example locations)
      const geofences = [
        {
          id: 'office-location',
          latitude: 3.1390,   // Kuala Lumpur coordinates
          longitude: 101.6869,
          radius: 100 // meters
        },
        {
          id: 'branch-location',
          latitude: 3.1502,
          longitude: 101.7128,
          radius: 150
        }
      ];
      
      // Register geofences
      geofences.forEach(async (geofence) => {
        try {
          await navigator.geofencing.add({
            id: geofence.id,
            latitude: geofence.latitude,
            longitude: geofence.longitude,
            radius: geofence.radius
          });
          console.log(`Geofence ${geofence.id} registered`);
        } catch (error) {
          console.error(`Failed to register geofence ${geofence.id}:`, error);
        }
      });
    } else {
      console.warn('Geofencing API not available in this browser');
    }
  } catch (error) {
    console.error('Geofencing setup failed:', error);
  }
}

// Initialize background features on service worker activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Setup periodic sync if supported
      if ('periodicSync' in self.registration) {
        try {
          await self.registration.periodicSync.register('periodic-attendance-sync', {
            minInterval: 24 * 60 * 60 * 1000, // Daily sync
          });
          console.log('Periodic sync registered');
        } catch (error) {
          console.error('Failed to register periodic sync:', error);
        }
      }
      
      // Setup geofencing
      await setupGeofencing();
    })()
  );
});
