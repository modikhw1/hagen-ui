/**
 * TikTok Follower Checker
 *
 * Användning:
 * 1. Öppna TikTok i Chrome
 * 2. Öppna Developer Tools (F12) → Console
 * 3. Klistra in och kör detta script
 *
 * Scriptet öppnar varje profil och loggar följarantal.
 */

const accounts = [
  'gelatonova',
  'rollinburgerssthlm',
  'spongecookiessthlm',
  'theboilsthlm',
  'theburgermansion',
  'kebabdudes',
  'subculturesweden',
  'oxlanbeefnoodle',
  'bocsthlm',
  'shamali.restaurang',
  'bramsburgers',
  'frestanuts',
  'thestreetfoodlabs'
];

// Manuell metod - öppnar alla profiler i nya flikar
function openAllProfiles() {
  accounts.forEach((account, i) => {
    setTimeout(() => {
      window.open(`https://www.tiktok.com/@${account}`, '_blank');
    }, i * 1000); // 1 sekund mellan varje för att inte trigga rate limit
  });
  console.log('Öppnar profiler... Kolla följarantal manuellt i varje flik.');
}

// Kör detta i console:
// openAllProfiles();

/**
 * ALTERNATIV: Apify API-metod (kräver API-nyckel)
 *
 * Om du har Apify-konto kan du använda deras API direkt:
 *
 * const APIFY_TOKEN = 'din-api-nyckel';
 *
 * async function checkFollowers(username) {
 *   const response = await fetch(
 *     `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`,
 *     {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         profiles: [username],
 *         resultsPerPage: 1
 *       })
 *     }
 *   );
 *   return response.json();
 * }
 */

// Quick copy-paste lista för TikTok-sökning:
console.log('=== KONTON ATT KOLLA ===');
accounts.forEach(a => console.log(`https://www.tiktok.com/@${a}`));
