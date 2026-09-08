(function(){
  // Use MapLibre with OpenStreetMap tiles for public tracking maps
  const mapboxToken = window.appConfig && window.appConfig.mapboxToken ? window.appConfig.mapboxToken : '';
  const socket = (typeof io === 'function') ? io() : null;

  const listEl = document.getElementById('shipments-list');
  // create a container for cards
  const cardsContainer = document.createElement('div'); cardsContainer.className = 'cards-grid';
  listEl.parentNode.replaceChild(cardsContainer, listEl);
  
  const searchEl = document.getElementById('search');
  const detailTitle = document.getElementById('detail-title');
  const detailBody = document.getElementById('detail-body');
  const openTracker = document.getElementById('open-tracker');

  let shipments = [];
  let selected = null;

  function fetchShipments(){
    return fetch('/api/assets').then(r=>r.json()).catch(()=>[]);
  }

  function renderList(filter){
    cardsContainer.innerHTML = '';
    const items = shipments.filter(s=>{
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (s.name||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q) || ((s.trackingNumber||'').toLowerCase().includes(q));
    });
    items.forEach(it=>{
      const card = document.createElement('div'); card.className='card';
      const meta = document.createElement('div'); meta.className='meta';
      const title = document.createElement('div'); title.className='title'; title.textContent = it.name || 'Unnamed';
      const sub = document.createElement('div'); sub.className='sub'; sub.textContent = it.modelNumber ? `${it.modelNumber}` : '';
      const carrier = document.createElement('div'); carrier.className='sub'; carrier.textContent = it.carrier?('Carrier: '+it.carrier):'';
      const eta = document.createElement('div'); eta.className='sub'; eta.textContent = it.eta?('ETA: '+it.eta):'';
      meta.appendChild(title); meta.appendChild(sub);
      meta.appendChild(carrier); meta.appendChild(eta);
      const idEl = document.createElement('div'); idEl.className='id'; idEl.textContent = it.trackingNumber || it.id || '';
      card.appendChild(meta); card.appendChild(idEl);
      card.addEventListener('click', ()=>selectShipment(it));
      cardsContainer.appendChild(card);
    });
  }

  // filters
  const statusFilter = document.getElementById('filter-status');
  const minSpeedEl = document.getElementById('filter-min-speed');
  const maxSpeedEl = document.getElementById('filter-max-speed');
  statusFilter.addEventListener('change', ()=> renderList(searchEl.value));
  minSpeedEl.addEventListener('input', ()=> renderList(searchEl.value));
  maxSpeedEl.addEventListener('input', ()=> renderList(searchEl.value));

  // table toggle
  const toggleTableBtn = document.getElementById('toggle-table');
  let tableMode = false;
  toggleTableBtn.addEventListener('click', ()=>{ tableMode = !tableMode; if (tableMode) showTableView(); else { document.querySelector('.shipments-panel').querySelector('.cards-grid').style.display='grid'; const t=document.querySelector('.table-view'); if (t) t.remove(); } });

  function showTableView(){
    const tbl = document.createElement('table'); tbl.className='table-view';
    const thead = document.createElement('thead'); thead.innerHTML='<tr><th>ID</th><th>Name</th><th>Tracking</th><th>Speed</th><th>Updated</th></tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    shipments.forEach(s=>{
      const tr = document.createElement('tr');
      const t = (s._tracking||{});
      tr.innerHTML = `<td>${s.id||''}</td><td>${s.name||''}</td><td>${s.trackingNumber||''}</td><td>${t.speed||''}</td><td>${t.updatedAt||''}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    document.querySelector('.shipments-panel').querySelector('.cards-grid').style.display='none';
    document.querySelector('.shipments-panel').appendChild(tbl);
  }

  // export CSV
  const exportBtn = document.getElementById('export-csv');
  exportBtn.addEventListener('click', ()=>{
    const rows = [['id','name','tracking','lat','lng','speed','updatedAt']];
    shipments.forEach(s=>{ const t=s._tracking||{}; rows.push([s.id||'',s.name||'',s.trackingNumber||'',t.lat||'',t.lng||'',t.speed||'',t.updatedAt||'']); });
    const csv = rows.map(r=>r.map(c=>`"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'shipments.csv'; a.click(); URL.revokeObjectURL(url);
  });

  // Reverse geocode helper (Nominatim)
  async function reverseGeocode(lat,lng){
    try{ const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`); if (!r.ok) return null; const j = await r.json(); return j.display_name || null; }catch(e){return null}
  }

  // compute ETA if destination exists
  function computeETA(pos, dest, speedKmh){
    if (!pos || !dest || !speedKmh || speedKmh<=0) return null;
    // haversine distance in km
    function haversine(a,b){ const R=6371; const toRad=v=>v*Math.PI/180; const dlat=toRad(b.lat-a.lat); const dlng=toRad(b.lng-a.lng); const la=toRad(a.lat); const lb=toRad(b.lat); const h=Math.sin(dlat/2)**2 + Math.cos(la)*Math.cos(lb)*Math.sin(dlng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
    const km = haversine({lat:pos.lat,lng:pos.lng},{lat:dest.lat,lng:dest.lng});
    const hours = km / speedKmh; if (!isFinite(hours)) return null; const eta = new Date(Date.now() + hours*3600*1000); return eta.toLocaleString();
  }

  // add clustering source and heat layer
  function updateClusterSource(tracking){
    try{
      const features = Object.keys(tracking||{}).map(id=>{ const t=tracking[id]; return { type:'Feature', properties:{ id, speed: t.speed||0, updatedAt: t.updatedAt||'' }, geometry:{ type:'Point', coordinates:[t.lng, t.lat] } }; });
      const geo = { type:'FeatureCollection', features };
      if (map && map.getSource){ if (map.getSource('shipments')){ map.getSource('shipments').setData(geo); } else { map.addSource('shipments',{ type:'geojson', data:geo, cluster:true, clusterMaxZoom: 14, clusterRadius: 50 }); map.addLayer({ id:'clusters', type:'circle', source:'shipments', filter:['has','point_count'], paint:{ 'circle-color':'#FF8C00','circle-radius': ['get','point_count'] } }); map.addLayer({ id:'cluster-count', type:'symbol', source:'shipments', filter:['has','point_count'], layout:{ 'text-field':'{point_count}', 'text-size':12 } }); map.addLayer({ id:'unclustered-point', type:'circle', source:'shipments', filter:['!',['has','point_count']], paint: { 'circle-color':'#00aaff', 'circle-radius':6 } }); }
    }catch(e){ console.error('cluster update err',e); }
  }

  // toast alerts
  const toastEl = document.getElementById('toast');
  function showToast(msg, time=5000){ toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'), time); }

  // realtime socket alerts
  if (socket){
    socket.on('position', pos=>{
      if (!pos) return;
      // alert if speed < 5 km/h
      if (pos.speed !== undefined && Number(pos.speed) < 5) showToast(`Slow shipment ${pos.id}: ${pos.speed} km/h`);
      // update cluster source
      fetch('/api/tracking').then(r=>r.json()).then(data=> updateClusterSource(data)).catch(()=>{});
    });
  }

  function selectShipment(s){
    selected = s;
    detailTitle.textContent = s.name || 'Shipment';
    detailBody.innerHTML = `
      <p><strong>ID:</strong> ${s.id||''}</p>
      <p><strong>Model:</strong> ${s.modelNumber||'—'}</p>
      <p><strong>Updated:</strong> ${s.updatedAt||'—'}</p>
    `;
    openTracker.href = `/tracking.html?id=${encodeURIComponent(s.id||'demo')}`;
    startSimulation();
    // subscribe to realtime updates for this shipment
    if (socket && s.id) {
      socket.emit('subscribe', s.id);
    }
  }

  // Map & simulation
  const startBtn = document.getElementById('start-track');
  const stopBtn = document.getElementById('stop-track');
  let map, marker, simInterval, route, idx=0;

  function initMap(){
    const center = [-0.1278,51.5074];
    let styleObj;
    if (mapboxToken) {
      styleObj = 'https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=' + mapboxToken;
    } else {
      styleObj = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256 } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
    }
    map = new maplibregl.Map({ container: 'map', style: styleObj, center, zoom: 9 });
    marker = new maplibregl.Marker({ color: '#FF8C00' }).setLngLat(center).addTo(map);
    route = [];
    for (let i=0;i<36;i++){ const ang=i*(Math.PI/18); route.push([center[0]+Math.cos(ang)*0.05, center[1]+Math.sin(ang)*0.05]); }
  }

  function startSimulation(){
    if (!map) initMap();
    if (simInterval) return;
    idx = 0;
    simInterval = setInterval(()=>{
      const p = route[idx%route.length];
      marker.setLngLat(p);
      map.panTo(p);
      idx++;
    },2000);
  }
  function stopSimulation(){ if (simInterval){ clearInterval(simInterval); simInterval=null; } }

  startBtn.addEventListener('click', startSimulation);
  stopBtn.addEventListener('click', stopSimulation);

  searchEl.addEventListener('input',(e)=>renderList(e.target.value));

  // copy link
  const copyBtn = document.getElementById('copy-link');
  copyBtn.addEventListener('click', ()=>{
    if (!selected) return alert('Select a shipment first');
    const url = `${window.location.origin}/tracking.html?id=${encodeURIComponent(selected.id)}`;
    navigator.clipboard.writeText(url).then(()=>alert('Link copied to clipboard'));
  });

  // create share link via server
  const createShareBtn = document.getElementById('create-share');
  // modal elements
  const shareModal = document.getElementById('share-modal');
  const shareBody = document.getElementById('share-modal-body');
  const shareCopy = document.getElementById('share-copy');
  const shareRevoke = document.getElementById('share-revoke');
  const shareClose = document.getElementById('share-close');

  createShareBtn.addEventListener('click', async ()=>{
    if (!selected) return alert('Select a shipment first');
    try{
      shareModal.setAttribute('aria-hidden','false');
      shareBody.textContent = 'Generating...';
      const res = await fetch(`/api/share/${encodeURIComponent(selected.id)}`, { method: 'POST' });
      const data = await res.json();
      if (data && data.url){
        shareBody.innerHTML = `<input id="share-url" style="width:100%" value="${data.url}" readonly>`;
        shareCopy.onclick = ()=>{ navigator.clipboard.writeText(data.url); alert('Copied'); };
        shareRevoke.onclick = async ()=>{
          const ok = confirm('Revoke this share link?');
          if (!ok) return;
          const token = data.token;
          const r = await fetch(`/api/share/${encodeURIComponent(token)}`, { method: 'DELETE' });
          const jr = await r.json();
          if (jr && jr.ok){ shareBody.textContent = 'Share link revoked'; }
          else shareBody.textContent = 'Failed to revoke';
        };
      } else { shareBody.textContent = 'Failed to create share link'; }
    }catch(e){ shareBody.textContent = 'Error creating share link'; }
  });

  shareClose.addEventListener('click', ()=>{ shareModal.setAttribute('aria-hidden','true'); });

  // simulate many shipments
  const simulateMany = async (count=5)=>{
    const ids = [];
    for (let i=0;i<count;i++){ ids.push('sim-'+Math.random().toString(36).slice(2,9)); }
    const routes = ids.map(id=>({ id, idx:0, route: (function(){ const c=[-0.1278,51.5074]; const r=[]; for(let j=0;j<36;j++){ const ang=j*(Math.PI/18); r.push([c[0]+Math.cos(ang)*(0.02+Math.random()*0.05), c[1]+Math.sin(ang)*(0.02+Math.random()*0.05)]); } return r; })() }));
    const interval = setInterval(()=>{
      routes.forEach(r=>{
        const p = r.route[r.idx % r.route.length];
        const payload = { id: r.id, lat: p[1], lng: p[0], speed: Math.floor(Math.random()*80) };
        fetch(`/api/track/${encodeURIComponent(r.id)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>{});
        if (socket) socket.emit('position', payload);
        r.idx++;
      });
    }, 2000);
    // stop after 60s
    setTimeout(()=>clearInterval(interval), 60000);
    alert('Simulating '+count+' shipments for 60s');
  };

  // add simulate many UI button
  const simManyBtn = document.createElement('button'); simManyBtn.className='btn'; simManyBtn.textContent='Simulate Many';
  simManyBtn.addEventListener('click', ()=> simulateMany(8));
  document.querySelector('.controls').appendChild(simManyBtn);

  // Quick track search (header)
  const trackQueryEl = document.getElementById('track-query');
  const trackGoBtn = document.getElementById('track-go');
  let searchMarker = null;
  trackGoBtn.addEventListener('click', async ()=>{
    const q = (trackQueryEl.value||'').trim();
    if (!q) return alert('Enter a tracking number');
    try{
      const assetsResp = await fetch('/api/assets');
      const assets = await assetsResp.json();
      const found = assets.find(a => (a.trackingNumber && a.trackingNumber.toString() === q) || (a.id && a.id.toString() === q));
      if (!found) return alert('Tracking number not found');
      const t = await fetch(`/api/track/${encodeURIComponent(found.id)}`);
      if (!t.ok) return alert('No tracking data yet for this shipment');
      const pos = await t.json();
      if (!pos) return alert('No tracking data');
      if (!map) initMap();
      if (searchMarker) try{ searchMarker.remove(); }catch(e){}
      searchMarker = new maplibregl.Marker({ color: '#00aaff' }).setLngLat([pos.lng, pos.lat]).addTo(map);
      map.flyTo({ center: [pos.lng, pos.lat], zoom: 12 });
      // show details in detail panel
      selected = found; detailTitle.textContent = found.name || 'Shipment';
      detailBody.innerHTML = `
        <p><strong>ID:</strong> ${found.id||''}</p>
        <p><strong>Tracking:</strong> ${found.trackingNumber||''}</p>
        <p><strong>Lat:</strong> ${pos.lat}</p>
        <p><strong>Lng:</strong> ${pos.lng}</p>
        <p><strong>Speed:</strong> ${pos.speed||'—'}</p>
      `;
    }catch(err){ console.error(err); alert('Error searching tracking'); }
  });

  // socket realtime handling
  if (socket) {
    socket.on('position', (pos)=>{
      if (!pos || !pos.id) return;
      // if current selected matches, update marker and detail
      if (selected && selected.id === pos.id) {
        if (!map) initMap();
        marker.setLngLat([pos.lng, pos.lat]);
        map.panTo([pos.lng, pos.lat]);
        detailBody.innerHTML = `\n          <p><strong>ID:</strong> ${pos.id||''}</p>\n          <p><strong>Lat:</strong> ${pos.lat||''}</p>\n          <p><strong>Lng:</strong> ${pos.lng||''}</p>\n          <p><strong>Speed:</strong> ${pos.speed||''}</p>\n          <p><strong>Updated:</strong> ${pos.updatedAt||''}</p>\n        `;
      }
    });
  }

  // Initial load
  Promise.all([fetchShipments(), fetch('/api/tracking').then(r=>r.json()).catch(()=>({}))]).then(([data, tracking])=>{
    shipments = Array.isArray(data)?data:[];
    // attach tracking info to shipments if present
    shipments.forEach(s=>{ if (tracking && tracking[s.id]) s._tracking = tracking[s.id]; });
    renderList();
    updateKPIs(shipments, tracking);
  });

  function updateKPIs(assets, tracking){
    const total = assets.length;
    const trackedIds = Object.keys(tracking||{});
    const active = trackedIds.length;
    const speeds = trackedIds.map(id=>Number(tracking[id].speed)||0).filter(v=>v>0);
    const avg = speeds.length?Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length):0;
    const lastUpdated = trackedIds.map(id=>tracking[id].updatedAt||0).sort().pop()||'—';
    document.getElementById('kpi-total').querySelector('.kpi-value').textContent = total;
    document.getElementById('kpi-active').querySelector('.kpi-value').textContent = active;
    document.getElementById('kpi-speed').querySelector('.kpi-value').textContent = avg + ' km/h';
    document.getElementById('kpi-updated').querySelector('.kpi-value').textContent = lastUpdated==='—'? '—' : new Date(lastUpdated).toLocaleString();
  }

})();
