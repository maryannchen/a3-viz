// ── DATA ─────────────────────────────────────────────────────────
async function loadData() {
  return await d3.csv('./data.csv', d => ({
    t:  d.title,
    d:  d.date,
    cr: d.content_rating,
    g:  d.main_genre,
    g2: d.secondary_genre,
    r:  +d.my_rating,
    ar: +d.avg_rating,
    y:  +d.year,
  }));
}

// ── CONSTANTS ────────────────────────────────────────────────────
const GENRE_COLORS = {
  'Drama':           '#5B8DB8',
  'Comedy':          '#E8C14A',
  'Fantasy':         '#9B6ECF',
  'Romance':         '#E07CA0',
  'Thriller':        '#E05C3A',
  'Science Fiction': '#4DD9AC',
};
const CR_COLORS = { 'G':'#6ECFB0','PG':'#E8C14A','PG-13':'#E07060','R':'#C0392B','NR':'#888' };
const GENRES = ['Drama','Comedy','Fantasy','Romance','Thriller','Science Fiction'];
const CRS    = ['G','PG','PG-13','R','NR'];
const ASPECT = 0.72;

const OSCAR_NOMS = new Set([
  'Frankenstein','One Battle After Another','Zootopia 2','Blue Moon',
  'Marty Supreme','The Smashing Machine','Hamnet','F1','Elio',
  'Song Sung Blue','Arco'
]);

const ROW_DEFS = [
  { seats:5,  yFrac:0.30 },
  { seats:6,  yFrac:0.40 },
  { seats:8,  yFrac:0.50 },
  { seats:9,  yFrac:0.59 },
  { seats:10, yFrac:0.68 },
  { seats:10, yFrac:0.78 },
  { seats:9,  yFrac:0.88 },
];

// ── GENRE GLOW ────────────────────────────────────────────────────
const GENRE_GLOW = {
  'all':             '#b8d0ff',
  'Drama':           '#5B8DB8',
  'Comedy':          '#E8C14A',
  'Fantasy':         '#9B6ECF',
  'Romance':         '#E07CA0',
  'Thriller':        '#E05C3A',
  'Science Fiction': '#4DD9AC',
};

// ── STATE ─────────────────────────────────────────────────────────
let DATA          = [];
let colorMode     = 'genre';
let sizeMode      = 'myRating';
let filterGenre   = 'all';
let scrubIndex    = -1;
let W, H;

// ── DOM REFS ─────────────────────────────────────────────────────
const svg  = d3.select('#theatre');
const wrap = document.getElementById('theatre-wrap');
const TIP  = document.getElementById('tooltip');

// ── LAYOUT ───────────────────────────────────────────────────────
function buildSeats(W, H) {
  const seats = [];
  ROW_DEFS.forEach((row, ri) => {
    const y    = row.yFrac * H;
    const span = row.seats / 10;
    const x0   = W * (0.5 - span * 0.44);
    const x1   = W * (0.5 + span * 0.44);
    const step = row.seats > 1 ? (x1 - x0) / (row.seats - 1) : 0;
    for (let si = 0; si < row.seats; si++) {
      const xi = x0 + si * step;
      const nx = row.seats > 1 ? (si / (row.seats - 1)) - 0.5 : 0;
      seats.push({ row:ri, col:si, x:xi, y: y - Math.pow(nx * 2, 2) * H * 0.016 });
    }
  });
  return seats;
}

// ── SCALES ───────────────────────────────────────────────────────
function getColor(d, mode) {
  if (mode === 'genre')         return GENRE_COLORS[d.g] || '#aaa';
  if (mode === 'myRating')      return d3.interpolateRdYlGn((d.r - 0.5) / 4.5);
  if (mode === 'avgRating')     return d3.interpolateCool((d.ar - 1) / 4);
  if (mode === 'contentRating') return CR_COLORS[d.cr] || '#aaa';
  return '#aaa';
}

function getSize(d, mode, base) {
  if (mode === 'myRating')  return base * (0.3 + (d.r / 5) * 1.4);
  if (mode === 'avgRating') return base * (0.3 + (d.ar / 5) * 1.4);
  if (mode === 'year')      return base * (0.5 + Math.min((2026 - d.y) / 65, 1) * 1.1);
  return base;
}

// ── DIMS ─────────────────────────────────────────────────────────
function updateDims() {
  const r = wrap.getBoundingClientRect();
  W = Math.max(r.width - 32, 300);
  H = W * ASPECT;
}


function isOscarNom(d) { return OSCAR_NOMS.has(d.t); }

// ── RENDER ───────────────────────────────────────────────────────
function render() {
  updateDims();
  if (!W || !H || !DATA.length) return;

  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);

  const base  = Math.max(W / 72, 5.5);
  const seats = buildSeats(W, H);

  // Defs
  svg.selectAll('defs').remove();
  const defs = svg.append('defs');

  const filt = defs.append('filter').attr('id','grain').attr('x','0%').attr('y','0%').attr('width','100%').attr('height','100%');
  filt.append('feTurbulence').attr('type','fractalNoise').attr('baseFrequency','0.65').attr('numOctaves','3').attr('stitchTiles','stitch').attr('result','noise');
  filt.append('feColorMatrix').attr('type','saturate').attr('values','0').attr('result','grayNoise');
  filt.append('feBlend').attr('in','SourceGraphic').attr('in2','grayNoise').attr('mode','multiply').attr('result','blend');
  filt.append('feComponentTransfer').attr('in','blend').append('feFuncA').attr('type','linear').attr('slope','1');

  const glowColor = GENRE_GLOW[filterGenre] || '#b8d0ff';
  const g1 = defs.append('radialGradient').attr('id','sg').attr('cx','50%').attr('cy','50%').attr('r','50%');
  g1.append('stop').attr('offset','0%').attr('stop-color', glowColor).attr('stop-opacity',0.28);
  g1.append('stop').attr('offset','100%').attr('stop-color','#000').attr('stop-opacity',0);

  const g2 = defs.append('linearGradient').attr('id','scr').attr('x1','0%').attr('y1','0%').attr('x2','0%').attr('y2','100%');
  g2.append('stop').attr('offset','0%').attr('stop-color','#dde8ff');
  g2.append('stop').attr('offset','100%').attr('stop-color','#a8bce0');

  const g3 = defs.append('linearGradient').attr('id','cL').attr('x1','0%').attr('x2','100%');
  g3.append('stop').attr('offset','0%').attr('stop-color','#5a0a0a');
  g3.append('stop').attr('offset','100%').attr('stop-color','transparent');

  const g4 = defs.append('linearGradient').attr('id','cR').attr('x1','100%').attr('x2','0%');
  g4.append('stop').attr('offset','0%').attr('stop-color','#5a0a0a');
  g4.append('stop').attr('offset','100%').attr('stop-color','transparent');

  const g5 = defs.append('linearGradient').attr('id','fl').attr('x1','0%').attr('y1','0%').attr('x2','0%').attr('y2','100%');
  g5.append('stop').attr('offset','0%').attr('stop-color','#1a0f06').attr('stop-opacity',0);
  g5.append('stop').attr('offset','100%').attr('stop-color','#1a0f06').attr('stop-opacity',0.5);

  // Theatre background
  svg.selectAll('.bg-all').remove();
  const bg = svg.append('g').attr('class','bg-all');
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','#0d0a07');
  bg.append('rect').attr('width',W).attr('height',H).attr('fill','#2a1e14').attr('opacity',0.18).attr('filter','url(#grain)');
  bg.append('ellipse').attr('class','screen-wash')
    .attr('cx',W/2).attr('cy',H*0.04).attr('rx',W*0.52).attr('ry',H*0.34)
    .attr('fill','url(#sg)');

  const sw=W*0.68, sh=H*0.07, sx=(W-sw)/2, sy=H*0.04;
  bg.append('rect').attr('x',sx).attr('y',sy).attr('width',sw).attr('height',sh)
    .attr('fill','url(#scr)').attr('rx',2).attr('stroke','#c8d8ff').attr('stroke-width',1);
  bg.append('text').attr('x',W/2).attr('y',sy+sh/2+1)
    .attr('text-anchor','middle').attr('dominant-baseline','middle')
    .attr('font-family','Playfair Display, serif').attr('font-style','italic')
    .attr('font-size',sh*0.45).attr('fill','#2a3555').attr('opacity',0.85)
    .text('Now Showing');
  bg.append('rect').attr('x',sx-20).attr('y',sy+sh).attr('width',sw+40).attr('height',H*0.04).attr('fill','#0f0b07');
  [0.21, 0.79].forEach(f =>
    bg.append('line').attr('x1',W*f).attr('y1',H*0.22).attr('x2',W*f).attr('y2',H)
      .attr('stroke','#2a1f10').attr('stroke-width',W*0.022).attr('opacity',0.5)
  );
  bg.append('rect').attr('x',0).attr('y',0).attr('width',W*0.12).attr('height',H).attr('fill','url(#cL)').attr('opacity',0.7);
  bg.append('rect').attr('x',W*0.88).attr('y',0).attr('width',W*0.12).attr('height',H).attr('fill','url(#cR)').attr('opacity',0.7);
  bg.append('rect').attr('x',0).attr('y',H*0.2).attr('width',W).attr('height',H*0.8).attr('fill','url(#fl)');

  // Seat shells
  svg.selectAll('.s-shell').remove();
  const seatW=base*1.7, seatH=base*1.1, seatBack=base*0.55;
  seats.forEach(s => {
    const g = svg.append('g').attr('class','s-shell').attr('transform',`translate(${s.x},${s.y})`);
    g.append('rect').attr('x',-seatW/2).attr('y',-(seatH/2+seatBack)).attr('width',seatW).attr('height',seatBack+2)
      .attr('rx',2).attr('fill','#5a3018').attr('stroke','#8a5030').attr('stroke-width',0.6);
    g.append('rect').attr('x',-seatW/2).attr('y',-seatH/2).attr('width',seatW).attr('height',seatH)
      .attr('rx',3).attr('fill','#4a2a14').attr('stroke','#7a4a28').attr('stroke-width',0.8);
  });

  // Determine visibility
  const sortedData = [...DATA].sort((a,b) => new Date(a.d) - new Date(b.d));
  const showUpTo   = scrubIndex === -1 ? sortedData.length - 1 : scrubIndex;
  const visibleTitles = new Set(sortedData.slice(0, showUpTo + 1).map(d => d.t));
  const paired = DATA.map((d, i) => ({ ...d, seat:seats[i], id:i }));
  const genreSet = new Set(paired.filter(d => filterGenre === 'all' || d.g === filterGenre).map(d => d.id));
  const visSet   = new Set(paired.filter(d => visibleTitles.has(d.t) && genreSet.has(d.id)).map(d => d.id));

  const spotlightId = null;



  // Theatregoers
  svg.selectAll('.tg').remove();
  const pg = svg.selectAll('.tg')
    .data(paired, d => d.id).enter()
    .append('g').attr('class','tg')
    .attr('transform', d => `translate(${d.seat.x},${d.seat.y})`)
    .style('cursor','pointer');

  // Determine opacity
  function bodyOpacity(d) {
    if (!visSet.has(d.id)) return 0;
    if (spotlightId !== null) return spotlightId === d.id ? 1 : 0.12;
    return 0.92;
  }
  function headOpacity(d) {
    if (!visSet.has(d.id)) return 0;
    if (spotlightId !== null) return spotlightId === d.id ? 0.75 : 0.05;
    return 0.75;
  }


  // Halos for perfect scores (gold pulse) and disasters (red pulse)
  pg.each(function(d) {
    if (!visSet.has(d.id)) return;
    const isPerfect  = d.r === 5;
    const isDisaster = d.r <= 0.5;
    if (!isPerfect && !isDisaster) return;
    const r = getSize(d, sizeMode, base);
    let opacity = isPerfect ? 0.22 : 0.18;
    if (spotlightId !== null) opacity *= spotlightId === d.id ? 1 : 0.08;
    d3.select(this).insert('circle', ':first-child')
      .attr('class', isPerfect ? 'halo-perfect' : 'halo-disaster')
      .attr('r', r * 1.6)
      .attr('fill', isPerfect ? '#c9a84c' : '#c0392b')
      .attr('opacity', opacity)
      .attr('pointer-events', 'none');
  });

  pg.append('circle')
    .attr('r', d => visSet.has(d.id) ? getSize(d, sizeMode, base) : 0)
    .attr('fill', d => getColor(d, colorMode))
    .attr('stroke', d => { const c = d3.color(getColor(d, colorMode)); return c ? c.darker(1).toString() : '#000'; })
    .attr('stroke-width', d => spotlightId === d.id ? 3 : 0.8)
    .attr('opacity', d => bodyOpacity(d))
    .transition().duration(400).ease(d3.easeCubicOut)
    .attr('r', d => visSet.has(d.id) ? getSize(d, sizeMode, base) : 0);

  pg.append('circle')
    .attr('cx', 0).attr('cy', d => -(getSize(d, sizeMode, base) * 0.85))
    .attr('r', d => visSet.has(d.id) ? getSize(d, sizeMode, base) * 0.45 : 0)
    .attr('fill', d => { const c = d3.color(getColor(d, colorMode)); return c ? c.darker(0.5).toString() : getColor(d, colorMode); })
    .attr('opacity', d => headOpacity(d));

  // Oscar nomination symbol
  pg.each(function(d) {
    if (!visSet.has(d.id)) return;
    if (!isOscarNom(d)) return;
    const r = getSize(d, sizeMode, base);
    let opacity = 1;
    if (spotlightId !== null) opacity = spotlightId === d.id ? 1 : 0.05;
    d3.select(this).append('text')
      .attr('x', 0)
      .attr('y', -(r * 1.6))
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', r * 0.7)
      .attr('fill', '#e8d8ff')
      .attr('opacity', opacity)
      .attr('pointer-events', 'none')
      .text('✦');
  });


  // Tooltip events
  pg.on('mouseover', function(event, d) {
      if (!visSet.has(d.id)) return;
      d3.select(this).selectAll('circle').filter(function(){ return !this.classList.contains('halo-perfect') && !this.classList.contains('halo-disaster'); }).transition().duration(100)
        .attr('r', getSize(d, sizeMode, base) * 1.4).attr('stroke-width', 2);
      showTooltip(d);
    })
    .on('mousemove', function(e) { moveTooltip(e); })
    .on('mouseout', function(event, d) {
      d3.select(this).selectAll('circle').filter(function(){ return !this.classList.contains('halo-perfect') && !this.classList.contains('halo-disaster'); }).transition().duration(100)
        .attr('r', getSize(d, sizeMode, base)).attr('stroke-width', 0.8);
      TIP.classList.remove('visible');
    });

  // Row labels
  svg.selectAll('.rl').remove();
  ROW_DEFS.forEach((_, ri) => {
    const f = seats.find(s => s.row === ri && s.col === 0);
    if (!f) return;
    svg.append('text').attr('class','rl')
      .attr('x', f.x - base * 3.2).attr('y', f.y + 1)
      .attr('text-anchor','middle').attr('dominant-baseline','middle')
      .attr('font-family','DM Mono, monospace').attr('font-size', base * 0.75)
      .attr('fill','#5a3a18').attr('opacity',0.85)
      .text(String.fromCharCode(65 + ri));
  });

  updateStats(paired, visSet);
  updateScrubLabel();
}

// ── TOOLTIP ───────────────────────────────────────────────────────
function getAnnotation(d) {
  if (d.r === 5)  return '♛';
  if (d.r <= 0.5) return '✕';
  const gap = d.ar - d.r;
  if (gap >= 1.5) return '↓';
  return '';
}

function showTooltip(d) {
  const ms = '★'.repeat(Math.round(d.r)) + '☆'.repeat(5 - Math.round(d.r));
  const as = '★'.repeat(Math.round(d.ar)) + '☆'.repeat(5 - Math.round(d.ar));
  const mo = new Date(d.d).toLocaleDateString('en-CA', { month:'short', year:'numeric' });
  const ann = getAnnotation(d);
  const annLabel = ann === '♛' ? ' · perfect score' : ann === '✕' ? ' · lowest rated' : ann === '↓' ? ' · crowd rated much higher' : '';
  const oscarTag = isOscarNom(d) ? ' · 2026 oscar nominated' : '';
  TIP.innerHTML = `
    <div class="tt-name"><span>${d.t}</span></div>
    <div class="tt-genre" style="color:${GENRE_COLORS[d.g]||'#aaa'}">${d.g}${d.g2?' · '+d.g2:''}${annLabel}${oscarTag}</div>
    <div class="tt-row"><span>My rating</span><span class="tt-val">${d.r}/5 ${ms}</span></div>
    <div class="tt-row"><span>Crowd avg</span><span class="tt-val">${d.ar}/5 ${as}</span></div>
    <div class="tt-row"><span>Watched</span><span class="tt-val">${mo}</span></div>
    <div class="tt-row"><span>Released</span><span class="tt-val">${d.y}</span></div>
    <div class="tt-row"><span>Rated</span><span class="tt-val">${d.cr}</span></div>`;
  TIP.classList.add('visible');
}
function moveTooltip(e) {
  TIP.style.left = Math.min(e.clientX + 14, window.innerWidth - 265) + 'px';
  TIP.style.top  = Math.min(e.clientY - 10, window.innerHeight - 210) + 'px';
}

// ── STATS ─────────────────────────────────────────────────────────
function updateStats(paired, visSet) {
  const vis = paired.filter(d => visSet.has(d.id));
  document.getElementById('s-count').textContent     = vis.length;
  document.getElementById('s-myrating').textContent  = vis.length ? (vis.reduce((s,d)=>s+d.r,0)/vis.length).toFixed(1) : '—';
  document.getElementById('s-avgrating').textContent = vis.length ? (vis.reduce((s,d)=>s+d.ar,0)/vis.length).toFixed(1) : '—';
  const gc  = d3.rollup(vis, v=>v.length, d=>d.g);
  const top = [...gc.entries()].sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('s-genre').textContent = top ? top[0] : '—';
}

// ── SCRUB ─────────────────────────────────────────────────────────
function updateScrubLabel() {
  const sortedData = [...DATA].sort((a,b) => new Date(a.d) - new Date(b.d));
  const el = document.getElementById('scrub-label');
  if (scrubIndex === -1 || scrubIndex >= sortedData.length - 1) {
    el.textContent = 'All films';
  } else {
    const d = sortedData[scrubIndex];
    const mo = new Date(d.d).toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' });
    el.textContent = `Up to ${mo} · ${scrubIndex + 1} film${scrubIndex > 0 ? 's' : ''}`;
  }
}


// ── LEGEND ────────────────────────────────────────────────────────
function buildLegend(mode) {
  const el = document.getElementById('legend');
  el.innerHTML = '';
  let items = [];
  if (mode === 'genre')
    items = GENRES.map(g => ({ label:g, color:GENRE_COLORS[g] }));
  else if (mode === 'myRating')
    items = [
      { label:'Low (0.5–2)',   color:d3.interpolateRdYlGn(0) },
      { label:'Mid (2.5–3.5)', color:d3.interpolateRdYlGn(0.5) },
      { label:'High (4–5)',    color:d3.interpolateRdYlGn(1) },
    ];
  else if (mode === 'avgRating')
    items = [
      { label:'Low',  color:d3.interpolateCool(0.1) },
      { label:'Mid',  color:d3.interpolateCool(0.5) },
      { label:'High', color:d3.interpolateCool(0.9) },
    ];
  else if (mode === 'contentRating')
    items = CRS.map(r => ({ label:r, color:CR_COLORS[r] }));

  const annItems = [
    { label:'2026 Oscars nominated', sym:'✦', color:'#e8d8ff' },
  ];

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<div class="legend-dot" style="background:${item.color}"></div>${item.label}`;
    el.appendChild(div);
  });
  const sep = document.createElement('div');
  sep.className = 'legend-sep';
  el.appendChild(sep);
  annItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<span class="legend-sym" style="color:${item.color}">${item.sym}</span>${item.label}`;
    el.appendChild(div);
  });
}

// ── CONTROLS ─────────────────────────────────────────────────────
document.getElementById('colorMode').addEventListener('change', function() { colorMode = this.value; buildLegend(colorMode); render(); });
document.getElementById('sizeMode').addEventListener('change',  function() { sizeMode  = this.value; render(); });
document.getElementById('filterMode').addEventListener('change', function() {
  filterGenre = this.value;
  render();
});
document.getElementById('scrubber').addEventListener('input', function() {
  scrubIndex = +this.value;
  render();
});
window.addEventListener('resize', render);

// ── INIT ─────────────────────────────────────────────────────────
buildLegend('genre');
loadData().then(rows => {
  DATA = rows;
  const sortedData = [...DATA].sort((a,b) => new Date(a.d) - new Date(b.d));
  const scrubber = document.getElementById('scrubber');
  scrubber.max   = DATA.length - 1;
  scrubber.value = DATA.length - 1;
  scrubIndex = -1;
  requestAnimationFrame(() => requestAnimationFrame(render));
});