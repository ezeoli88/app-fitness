const base = process.env.APP_URL;
const id = process.env.CF_ACCESS_CLIENT_ID;
const secret = process.env.CF_ACCESS_CLIENT_SECRET;

if (!base || !id || !secret) {
  console.error('Faltan APP_URL, CF_ACCESS_CLIENT_ID o CF_ACCESS_CLIENT_SECRET.');
  process.exit(1);
}

const headers = { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };

const anonymousHealth = await fetch(`${base}/api/health`, { redirect: 'manual' });
const anonymousHome = await fetch(base, { redirect: 'manual' });
if (anonymousHealth.status !== 302 || anonymousHome.status !== 302) {
  console.error('Sin token, / y /api/health tienen que redirigir a Access.', anonymousHealth.status, anonymousHome.status);
  process.exit(1);
}
const location = anonymousHealth.headers.get('location') ?? '';
if (!location.includes('cloudflareaccess.com')) {
  console.error('La redirección no apunta a Access.', location);
  process.exit(1);
}

const health = await fetch(`${base}/api/health`, { headers });
if (health.status !== 200) {
  console.error('El token de servicio no pudo leer /api/health.', health.status);
  process.exit(1);
}
const home = await fetch(base, { headers });
if (home.status !== 200 || !(await home.text()).includes('<div id="root">')) {
  console.error('El inicio autenticado no devolvió la app.');
  process.exit(1);
}
console.log('Access responde como se espera.');
