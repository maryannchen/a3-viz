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

const ROW_DEFS = [
  { seats:5,  yFrac:0.30 },
  { seats:6,  yFrac:0.40 },
  { seats:8,  yFrac:0.50 },
  { seats:9,  yFrac:0.59 },
  { seats:10, yFrac:0.68 },
  { seats:10, yFrac:0.78 },
  { seats:9,  yFrac:0.88 },
];

// ── INSIGHT CARDS ─────────────────────────────────────────────────
// Each card defines which film titles to spotlight and what to say.
// Built after data loads (see buildInsights).
let INSIGHTS = [];

function buildInsights(sortedData) {
  const perfectTitles = sortedData.filter(d => d.r === 5).map(d => d.t);
  const disasterTitles = sortedData.filter(d => d.r <= 0.5).map(d => d.t);
  const janTitles = sortedData.filter(d => d.d.startsWith('2026-01')).map(d => d.t);
  // Perfect run Oct–Dec: first 7 perfect scores all fell before Jan
  const earlyPerfect = sortedData.filter(d => d.r === 5 && d.d < '2026-01-01').map(d => d.t);
  // Biggest crowd vs me gap
  const iOriginsTitle = ['I Origins'];
  const oldestTitle   = ['The Sound of Music'];

  return [
    {
      id: 'perfect',
      icon: '♛',
      label: 'Nine perfect scores',
      desc: '9 films earned 5 stars. 7 of them were in the first three months, then a dry spell before Hamnet and Django Unchained in January.',
      titles: perfectTitles,
      color: '#FFD700',
    },
    {
      id: 'january',
      icon: '📽',
      label: 'January binge',
      desc: 'January was by far my biggest watch-month: 16 films in 31 days.',
      titles: janTitles,
      color: '#9B6ECF',
    },
    {
      id: 'disasters',
      icon: '✕',
      label: 'Disasters',
      desc: 'War of the Worlds and Cats both scored 0.5 stars, my lowest ratings that were just four weeks apart.',
      titles: disasterTitles,
      color: '#ff4444',
    },
    {
      id: 'crowd',
      icon: '↓',
      label: 'Biggest crowd gap',
      desc: 'I Origins is where I diverged most from the crowd: there was 1.7-star gap. In my opinion, it was pretty disappointing.',
      titles: iOriginsTitle,
      color: '#aaaaff',
    },
    {
      id: 'oldest',
      icon: '🎞',
      label: 'Oldest 5-star',
      desc: 'The Sound of Music (1965) is the oldest film I watched and it is still perfect, 60 years on.',
      titles: oldestTitle,
      color: '#C9A84C',
    },
  ];
}

// ── TOUR STOPS ────────────────────────────────────────────────────
const TOUR_STOPS = [
  { idx:0,  msg:"I started my watch season with Loving Vincent, a hand-painted masterpiece." },
  { idx:3,  msg:"An early standout: Chainsaw Man earned my first perfect 5 stars." },
  { idx:6,  msg:"Sinners — another 5-star score and one of my new personal favorites." },
  { idx:10, msg:"Your Name Engraved Herein — a quiet 5-star gem midway through November." },
  { idx:17, msg:"The Sound of Music - made in 1965, and a forever timeless classic." },
  { idx:20, msg:"I rewatched Klaus for the holiday season and it never disappoiints." },
  { idx:24, msg:"Marty Supreme closed out 2025 on a high note for me." },
  { idx:32, msg:"Hamnet was my highest-rated drama of January. Congratulations Jessie Buckley on the Oscar!" },
  { idx:35, msg:"Django Unchained — 5 stars. January was a great month." },
  { idx:37, msg:"War of the Worlds - probably the worst movie of the year." },
  { idx:46, msg:"Cats (2019). No further comment." },
  { idx:52, msg:"The French Dispatch — 4.5 stars. A strong way to round out my season." },
  { idx:56, msg:"I Origins is my most recent entry...and I wish it was better!" },
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
let tourActive    = false;
let tourStep      = 0;
let tourTimer     = null;
let activeInsight = null;   // id of currently spotlit insight card, or null
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
  if (mode === 'myRating')  return base * (0.55 + (d.r / 5) * 0.95);
  if (mode === 'avgRating') return base * (0.55 + (d.ar / 5) * 0.95);
  if (mode === 'year')      return base * (0.5 + Math.min((2026 - d.y) / 65, 1) * 1.1);
  return base;
}

// ── DIMS ─────────────────────────────────────────────────────────
function updateDims() {
  const r = wrap.getBoundingClientRect();
  W = Math.max(r.width - 32, 300);
  H = W * ASPECT;
}

// ── ANNOTATIONS ──────────────────────────────────────────────────
function getAnnotation(d) {
  if (d.r === 5)           return '♛';
  if (d.r <= 0.5)          return '✕';
  if (d.r - d.ar >= 1.2)  return '↑';
  if (d.ar - d.r >= 1.2)  return '↓';
  return null;
}

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

  // Spotlight: tour takes priority, then insight card
  const spotlightTitle = tourActive
    ? (TOUR_STOPS[tourStep] ? sortedData[TOUR_STOPS[tourStep].idx]?.t : null)
    : null;
  const spotlightId = spotlightTitle ? paired.find(d => d.t === spotlightTitle)?.id : null;

  const insightTitles = activeInsight
    ? new Set(INSIGHTS.find(i => i.id === activeInsight)?.titles || [])
    : null;

  // ── Always-on halo rings (drawn before persons so they sit behind) ──
  svg.selectAll('.halo').remove();
  paired.forEach(d => {
    if (!visSet.has(d.id)) return;
    const r = getSize(d, sizeMode, base);
    if (d.r === 5) {
      // Pulsing gold ring for perfect scores
      svg.append('circle').attr('class','halo halo-perfect')
        .attr('cx', d.seat.x).attr('cy', d.seat.y)
        .attr('r', r * 1.65)
        .attr('fill','none')
        .attr('stroke','#FFD700')
        .attr('stroke-width', 1.2)
        .attr('opacity', 0.55);
    } else if (d.r <= 0.5) {
      // Dark shadow ring for disasters
      svg.append('circle').attr('class','halo halo-disaster')
        .attr('cx', d.seat.x).attr('cy', d.seat.y)
        .attr('r', r * 1.65)
        .attr('fill','none')
        .attr('stroke','#ff2222')
        .attr('stroke-width', 1.2)
        .attr('opacity', 0.45);
    }
  });

  // Theatregoers
  svg.selectAll('.tg').remove();
  const pg = svg.selectAll('.tg')
    .data(paired, d => d.id).enter()
    .append('g').attr('class','tg')
    .attr('transform', d => `translate(${d.seat.x},${d.seat.y})`)
    .style('cursor','pointer');

  // Determine opacity: tour > insight > normal
  function bodyOpacity(d) {
    if (!visSet.has(d.id)) return 0;
    if (spotlightId !== null) return spotlightId === d.id ? 1 : 0.12;
    if (insightTitles)        return insightTitles.has(d.t)  ? 1 : 0.1;
    return 0.92;
  }
  function headOpacity(d) {
    if (!visSet.has(d.id)) return 0;
    if (spotlightId !== null) return spotlightId === d.id ? 0.75 : 0.05;
    if (insightTitles)        return insightTitles.has(d.t)  ? 0.75 : 0.05;
    return 0.75;
  }
  function haloOpacity(d) {
    if (!visSet.has(d.id)) return 0;
    if (spotlightId !== null) return spotlightId === d.id ? 0.9 : 0.05;
    if (insightTitles)        return insightTitles.has(d.t)  ? 0.9 : 0.05;
    return d.r === 5 ? 0.55 : 0.45;
  }

  // Update halo opacity based on spotlight
  svg.selectAll('.halo').attr('opacity', function() {
    const cx = +d3.select(this).attr('cx');
    const cy = +d3.select(this).attr('cy');
    const match = paired.find(d => Math.abs(d.seat.x - cx) < 1 && Math.abs(d.seat.y - cy) < 1);
    return match ? haloOpacity(match) : 0.5;
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

  // Annotation symbols
  pg.each(function(d) {
    if (!visSet.has(d.id)) return;
    const ann = getAnnotation(d);
    if (!ann) return;
    const r = getSize(d, sizeMode, base);
    let opacity = 1;
    if (spotlightId !== null) opacity = spotlightId === d.id ? 1 : 0.05;
    else if (insightTitles)   opacity = insightTitles.has(d.t) ? 1 : 0.05;
    d3.select(this).append('text')
      .attr('x', 0).attr('y', -(r * 1.55))
      .attr('text-anchor','middle').attr('dominant-baseline','middle')
      .attr('font-size', r * 0.85)
      .attr('fill', ann === '♛' ? '#FFD700' : ann === '✕' ? '#ff4444' : '#ccc')
      .attr('opacity', opacity)
      .attr('pointer-events','none')
      .text(ann);
  });

  // Tooltip events
  pg.on('mouseover', function(event, d) {
      if (!visSet.has(d.id)) return;
      if (tourActive) return;
      d3.select(this).select('circle').transition().duration(100)
        .attr('r', getSize(d, sizeMode, base) * 1.4).attr('stroke-width', 2);
      showTooltip(d);
    })
    .on('mousemove', function(e) { moveTooltip(e); })
    .on('mouseout', function(e, d) {
      if (tourActive) return;
      d3.select(this).select('circle').transition().duration(100)
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
function showTooltip(d) {
  const ms = '★'.repeat(Math.round(d.r)) + '☆'.repeat(5 - Math.round(d.r));
  const as = '★'.repeat(Math.round(d.ar)) + '☆'.repeat(5 - Math.round(d.ar));
  const mo = new Date(d.d).toLocaleDateString('en-CA', { month:'short', year:'numeric' });
  const ann = getAnnotation(d);
  const annLabel = ann === '♛' ? ' · perfect score' : ann === '✕' ? ' · lowest rated' : ann === '↑' ? ' · I rated higher' : ann === '↓' ? ' · crowd rated higher' : '';
  TIP.innerHTML = `
    <div class="tt-name">${d.t}${ann ? `<span class="tt-ann">${ann}</span>` : ''}</div>
    <div class="tt-genre" style="color:${GENRE_COLORS[d.g]||'#aaa'}">${d.g}${d.g2?' · '+d.g2:''}${annLabel}</div>
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

// ── INSIGHT CARDS ─────────────────────────────────────────────────
function buildInsightCards() {
  const container = document.getElementById('insights');
  container.innerHTML = '';
  INSIGHTS.forEach(ins => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    card.dataset.id = ins.id;
    card.innerHTML = `
      <div class="ic-icon" style="color:${ins.color}">${ins.icon}</div>
      <div class="ic-label">${ins.label}</div>
      <div class="ic-desc">${ins.desc}</div>`;
    card.addEventListener('click', () => {
      if (tourActive) stopTour();
      if (activeInsight === ins.id) {
        // Toggle off
        activeInsight = null;
        document.querySelectorAll('.insight-card').forEach(c => c.classList.remove('active'));
        TIP.classList.remove('visible');
      } else {
        activeInsight = ins.id;
        document.querySelectorAll('.insight-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        TIP.classList.remove('visible');
      }
      render();
    });
    container.appendChild(card);
  });
}

// ── AUTO-TOUR ─────────────────────────────────────────────────────
function startTour() {
  stopTour();
  activeInsight = null;
  document.querySelectorAll('.insight-card').forEach(c => c.classList.remove('active'));
  tourActive = true;
  tourStep   = 0;
  scrubIndex = -1;
  filterGenre = 'all';
  document.getElementById('filterMode').value = 'all';
  document.getElementById('tour-btn').textContent = '◼ Stop Tour';
  document.getElementById('tour-btn').classList.add('active');
  runTourStep();
}

function stopTour() {
  tourActive = false;
  if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; }
  TIP.classList.remove('visible');
  document.getElementById('tour-btn').textContent = '▶ Auto Tour';
  document.getElementById('tour-btn').classList.remove('active');
  document.getElementById('tour-card').classList.remove('visible');
  render();
}

function runTourStep() {
  if (!tourActive) return;
  if (tourStep >= TOUR_STOPS.length) { stopTour(); return; }
  const stop = TOUR_STOPS[tourStep];
  const sortedData = [...DATA].sort((a,b) => new Date(a.d) - new Date(b.d));
  scrubIndex = stop.idx;
  render();
  const card = document.getElementById('tour-card');
  const d = sortedData[stop.idx];
  card.innerHTML = `
    <div class="tc-step">${tourStep+1} / ${TOUR_STOPS.length}</div>
    <div class="tc-title">${d.t}</div>
    <div class="tc-msg">${stop.msg}</div>
    <div class="tc-nav">
      <button onclick="tourPrev()">‹ Prev</button>
      <button onclick="tourNext()">Next ›</button>
    </div>`;
  card.classList.add('visible');
  const paired = DATA.map((dd,i) => ({ ...dd, id:i }));
  const target = paired.find(dd => dd.t === d.t);
  if (target) showTooltip(target);
  TIP.style.left = (window.innerWidth / 2 - 125) + 'px';
  TIP.style.top  = (window.innerHeight * 0.72) + 'px';
}

function tourNext() { tourStep++; if (tourStep >= TOUR_STOPS.length) { stopTour(); return; } runTourStep(); }
function tourPrev() { tourStep = Math.max(0, tourStep - 1); runTourStep(); }

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
    { label:'Perfect (5★)', sym:'♛', color:'#FFD700' },
    { label:'Lowest rated', sym:'✕', color:'#ff4444' },
    { label:'I > Crowd',    sym:'↑', color:'#ccc' },
    { label:'Crowd > I',    sym:'↓', color:'#ccc' },
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
  activeInsight = null;
  document.querySelectorAll('.insight-card').forEach(c => c.classList.remove('active'));
  render();
});
document.getElementById('scrubber').addEventListener('input', function() {
  if (tourActive) stopTour();
  scrubIndex = +this.value;
  render();
});
document.getElementById('tour-btn').addEventListener('click', function() {
  tourActive ? stopTour() : startTour();
});
window.addEventListener('resize', render);

// ── INIT ─────────────────────────────────────────────────────────
buildLegend('genre');
loadData().then(rows => {
  DATA = rows;
  const sortedData = [...DATA].sort((a,b) => new Date(a.d) - new Date(b.d));
  INSIGHTS = buildInsights(sortedData);
  buildInsightCards();
  const scrubber = document.getElementById('scrubber');
  scrubber.max   = DATA.length - 1;
  scrubber.value = DATA.length - 1;
  scrubIndex = -1;
  requestAnimationFrame(() => requestAnimationFrame(render));
});
