(function(){
  // Using MapLibre with OpenStreetMap tiles to avoid Mapbox token requirement
  const token = window.appConfig && window.appConfig.mapboxToken ? window.appConfig.mapboxToken : '';
  const socket = (typeof io === 'function') ? io() : null;

  // Get tracking ID from query (?id=) or URL path /track/:id
  const params = new URLSearchParams(window.location.search);
  let trackId = params.get('id') || params.get('track') || '';
  if (!trackId) {
    const pathParts = window.location.pathname.split('/');
    trackId = pathParts[pathParts.length-1] || 'demo-1';
  }
  document.getElementById('track-id').textContent = trackId;

  // Fallback center
  const start = [ -0.1278, 51.5074 ];

  let style;
  if (token) {
    style = 'https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=' + token;
  } else {
    style = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
  }

  const map = new maplibregl.Map({ container: 'map', style, center: start, zoom: 9 });
  let marker = new maplibregl.Marker({ color: '#FFD700' }).setLngLat(start).addTo(map);

  const coordsEl = { lat: document.getElementById('lat'), lng: document.getElementById('lng'), speed: document.getElementById('speed') };

  // Simulated path (a simple circular route near start)
  const route = [];
  for (let i=0;i<36;i++){
    const angle = i * (Math.PI/18);
    const radius = 0.05; // degrees
    route.push([ start[0] + Math.cos(angle)*radius, start[1] + Math.sin(angle)*radius ]);
  }

  let index = 0;
  let intervalId = null;

  function updatePosition() {
    const p = route[index % route.length];
    marker.setLngLat(p);
    map.panTo(p);
    coordsEl.lat.textContent = p[1].toFixed(6);
    coordsEl.lng.textContent = p[0].toFixed(6);
    coordsEl.speed.textContent = (Math.random()*60).toFixed(1);
    const payload = { id: trackId, lat: p[1], lng: p[0], speed: parseFloat(coordsEl.speed.textContent) };
    // POST to REST API
    fetch(`/api/track/${encodeURIComponent(trackId)}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>{});
    // Emit via socket
    if (socket) socket.emit('position', payload);
    index++;
  }

  document.getElementById('start').addEventListener('click', ()=>{
    if (intervalId) return;
    intervalId = setInterval(updatePosition, 2000);
    updatePosition();
  });

  document.getElementById('stop').addEventListener('click', ()=>{
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  });

  // Auto-start simulation for demo
  setTimeout(()=>document.getElementById('start').click(),800);
})();
