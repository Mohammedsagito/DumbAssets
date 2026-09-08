(function(){
  const mapboxToken = window.appConfig && window.appConfig.mapboxToken ? window.appConfig.mapboxToken : '';
  if (mapboxToken) mapboxgl.accessToken = mapboxToken;
  const socket = (typeof io === 'function') ? io() : null;

  const listEl = document.getElementById('shipments-list');
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
    listEl.innerHTML = '';
    const items = shipments.filter(s=>{
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (s.name||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q);
    });
    items.forEach(it=>{
      const li = document.createElement('li');
      li.textContent = `${it.name || 'Unnamed'} — ${it.id || ''}`;
      li.addEventListener('click', ()=>selectShipment(it));
      listEl.appendChild(li);
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
    map = new mapboxgl.Map({container:'map',style: mapboxToken?('https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token='+mapboxToken):'https://demotiles.example/style.json',center,zoom:9});
    marker = new mapboxgl.Marker({color:'#FF8C00'}).setLngLat(center).addTo(map);
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
  fetchShipments().then(data=>{ shipments = Array.isArray(data)?data:[]; renderList(); });

})();
