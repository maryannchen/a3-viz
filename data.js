export async function loadData() {
  const raw = await d3.csv('./data.csv', d => ({
    t:  d.title,
    d:  d.date,
    cr: d.content_rating,
    g:  d.main_genre,
    g2: d.secondary_genre,
    r:  +d.my_rating,
    ar: +d.avg_rating,
    y:  +d.year,
  }));
  return raw;
}
