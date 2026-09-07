import { NextResponse } from 'next/server';

/**
 * Weather for a training, by its Israeli Transverse Mercator grid reference.
 *
 * The unit records locations as נצ״ד on the new Israeli grid, so the reference
 * is converted to WGS84 here and handed to Open-Meteo. Anything that fails
 * returns 404 and the screen falls back to its own labelled estimate — a wrong
 * forecast presented as fact is worse than an honest "הערכה".
 */
export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coords = searchParams.get('coords') ?? '';
  const date = searchParams.get('date') ?? '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'bad date' }, { status: 400 });

  const wgs = itmToWgs84(coords);
  if (!wgs) return NextResponse.json({ error: 'bad coords' }, { status: 404 });

  // Open-Meteo serves forecasts about 16 days out; beyond that there is nothing to fetch
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${wgs.lat.toFixed(4)}&longitude=${wgs.lon.toFixed(4)}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FJerusalem` +
    `&start_date=${date}&end_date=${date}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 404 });
    const data = await res.json();
    const hi = data?.daily?.temperature_2m_max?.[0];
    const lo = data?.daily?.temperature_2m_min?.[0];
    const code = data?.daily?.weather_code?.[0];
    if (hi == null || lo == null) return NextResponse.json({ error: 'no data' }, { status: 404 });
    return NextResponse.json({ hi: Math.round(hi), lo: Math.round(lo), text: describe(code) });
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 404 });
  }
}

/** WMO weather codes, in the words a briefing would use. */
function describe(code: number | undefined): string {
  if (code == null) return 'לא ידוע';
  if (code === 0) return 'בהיר';
  if (code <= 2) return 'מעונן חלקית';
  if (code === 3) return 'מעונן';
  if (code <= 48) return 'ערפל';
  if (code <= 57) return 'טפטוף';
  if (code <= 67) return 'גשם';
  if (code <= 77) return 'שלג';
  if (code <= 82) return 'ממטרים';
  if (code <= 86) return 'ממטרי שלג';
  return 'סופות רעמים';
}

/**
 * Israeli Transverse Mercator (EPSG:2039) → WGS84.
 *
 * Grid references are written as six digits each — `234700 652100` — which are
 * the metre coordinates with the leading digit dropped, so they are restored
 * before the projection is inverted. GRS80 ellipsoid, as ITM uses.
 */
function itmToWgs84(raw: string): { lat: number; lon: number } | null {
  const parts = raw.trim().split(/[\s,]+/);
  if (parts.length < 2) return null;
  let east = Number(parts[0]);
  let north = Number(parts[1]);
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;

  // six-digit shorthand: easting is 1xxxxx–2xxxxx, northing 3xxxxx–7xxxxx
  if (east < 100000) east += 200000;
  if (north < 1000000) north += north < 400000 ? 1000000 : 500000;

  const a = 6378137.0;
  const f = 1 / 298.257222101; // GRS80
  const k0 = 1.0000067;
  const lat0 = (31 + 44 / 60 + 3.817 / 3600) * (Math.PI / 180);
  const lon0 = (35 + 12 / 60 + 16.261 / 3600) * (Math.PI / 180);
  const falseEasting = 219529.584;
  const falseNorthing = 626907.39;

  const e2 = 2 * f - f * f;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const M0 = meridian(lat0, a, e2);
  const M = M0 + (north - falseNorthing) / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const C1 = ep2 * cos1 * cos1;
  const T1 = tan1 * tan1;
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = (east - falseEasting) / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cos1;

  const deg = 180 / Math.PI;
  const out = { lat: lat * deg, lon: lon * deg };
  // sanity bounds: anything outside Israel means the reference was mistyped
  if (out.lat < 29 || out.lat > 34 || out.lon < 33 || out.lon > 36.5) return null;
  return out;
}

function meridian(phi: number, a: number, e2: number): number {
  return (
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  );
}
