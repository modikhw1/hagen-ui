/**
 * Download Simpsons Scripts from Archive.org
 *
 * Downloads HTML versions of Simpsons scripts (seasons 1-8)
 * from Internet Archive and saves them locally.
 *
 * Usage: node scripts/download-simpsons-scripts.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '../datasets/simpsons-scripts');

// Complete script list - seasons 1-8, preferring final/recorded drafts
const SCRIPTS = [
  // Season 1
  { id: '7G01-some-enchanted-evening-final-draft', season: 1, ep: '7G01', title: 'Some Enchanted Evening' },
  { id: '7G02-bart-the-genius-final-delivery', season: 1, ep: '7G02', title: 'Bart the Genius' },
  { id: 'homersodysseyscript', season: 1, ep: '7G03', title: 'Homers Odyssey' },
  { id: '7G04-theres-no-disgrace-like-home-final-delivery', season: 1, ep: '7G04', title: 'Theres No Disgrace Like Home' },
  { id: '7G05-bart-the-general-final-delivery', season: 1, ep: '7G05', title: 'Bart the General' },
  { id: '7G06-moaning-lisa-final-delivery', season: 1, ep: '7G06', title: 'Moaning Lisa' },
  { id: '7G07-the-telltale-head-as-recorded', season: 1, ep: '7G07', title: 'The Telltale Head' },
  { id: '7G08-simpsons-roasting-on-an-open-fire-revised-final-delivery', season: 1, ep: '7G08', title: 'Simpsons Roasting on an Open Fire' },
  { id: '7G09-the-call-of-the-simpsons-final-delivery', season: 1, ep: '7G09', title: 'The Call of the Simpsons' },
  { id: '7G10-homers-night-out-final-delivery', season: 1, ep: '7G10', title: 'Homers Night Out' },
  { id: '7G11-life-on-the-fast-lane-final-delivery', season: 1, ep: '7G11', title: 'Life on the Fast Lane' },
  { id: '7G12-krusty-gets-busted-final-delivery', season: 1, ep: '7G12', title: 'Krusty Gets Busted' },
  { id: '7G13-the-crepes-of-wrath-final-delivery', season: 1, ep: '7G13', title: 'The Crepes of Wrath' },

  // Season 2
  { id: '7F01-two-cars-in-every-garage-and-three-eyes-on-every-fish-revised-table-draft', season: 2, ep: '7F01', title: 'Two Cars in Every Garage' },
  { id: '7F02-simpson-and-delilah-table-draft', season: 2, ep: '7F02', title: 'Simpson and Delilah' },
  { id: '7F03-bart-gets-an-f-table-draft', season: 2, ep: '7F03', title: 'Bart Gets an F' },
  { id: '7F04-treehouse-of-horror-final-delivery', season: 2, ep: '7F04', title: 'Treehouse of Horror' },
  { id: '7f05-dancin-homer-table-draft', season: 2, ep: '7F05', title: 'Dancin Homer' },
  { id: '7f06-bart-the-daredevil-table-draft', season: 2, ep: '7F06', title: 'Bart the Daredevil' },
  { id: '7f07-bart-vs.-thanksgiving-table-draft', season: 2, ep: '7F07', title: 'Bart vs Thanksgiving' },
  { id: '7F08-dead-putting-society-table-draft', season: 2, ep: '7F08', title: 'Dead Putting Society' },
  { id: '7F09-itchy-scratchy-marge-revised-table-draft', season: 2, ep: '7F09', title: 'Itchy Scratchy Marge' },
  { id: '7F10-bart-gets-hit-by-a-car-table-draft', season: 2, ep: '7F10', title: 'Bart Gets Hit by a Car' },
  { id: 'thesimpsonsblowfishtwofishscript', season: 2, ep: '7F11', title: 'One Fish Two Fish Blowfish Blue Fish' },
  { id: 'the-simpsons-the-way-we-was-table-draft', season: 2, ep: '7F12', title: 'The Way We Was' },
  { id: 'the-simpsons-homer-vs.-lisa-and-the-8th-commandment-revised-table-draft', season: 2, ep: '7F13', title: 'Homer vs Lisa and the 8th Commandment' },
  { id: '7F14-barts-dog-gets-an-f-table-draft', season: 2, ep: '7F14', title: 'Barts Dog Gets an F' },
  { id: '7F15-principal-charming-revised-table-draft', season: 2, ep: '7F15', title: 'Principal Charming' },
  { id: '7F16-oh-brother-where-art-thou-table-draft', season: 2, ep: '7F16', title: 'Oh Brother Where Art Thou' },
  { id: '7F17-old-money-table-draft', season: 2, ep: '7F17', title: 'Old Money' },
  { id: 'the-simpsons-brush-with-greatness-revised-table-draft', season: 2, ep: '7F18', title: 'Brush with Greatness' },
  { id: 'the-simpsons-lisas-substitute-revised-table-draft', season: 2, ep: '7F19', title: 'Lisas Substitute' },
  { id: 'the-simpsons-the-war-of-the-simpsons-revised-table-draft', season: 2, ep: '7F20', title: 'The War of the Simpsons' },
  { id: '7F21-three-men-and-a-comic-book-table-draft', season: 2, ep: '7F21', title: 'Three Men and a Comic Book' },
  { id: '7F22-blood-feud-table-draft', season: 2, ep: '7F22', title: 'Blood Feud' },
  { id: 'the-simpsons-when-flanders-failed-table-draft', season: 2, ep: '7F23', title: 'When Flanders Failed' },
  { id: '7F24-stark-raving-dad-final-delivery', season: 2, ep: '7F24', title: 'Stark Raving Dad' },

  // Season 3
  { id: '8F01-mr.-lisa-goes-to-washington-revised-table-draft', season: 3, ep: '8F01', title: 'Mr Lisa Goes to Washington' },
  { id: '8-f-02-treehouse-of-horror-ii-table-draft', season: 3, ep: '8F02', title: 'Treehouse of Horror II' },
  { id: '8F03-bart-the-murderer-final-delivery', season: 3, ep: '8F03', title: 'Bart the Murderer' },
  { id: '8F04-homer-defined-table-draft', season: 3, ep: '8F04', title: 'Homer Defined' },
  { id: '8F05-like-father-like-clown-final-delivery', season: 3, ep: '8F05', title: 'Like Father Like Clown' },
  { id: '8F06-lisas-pony-final-delivery', season: 3, ep: '8F06', title: 'Lisas Pony' },
  { id: '8F07-saturdays-of-thunder-revised-table-draft', season: 3, ep: '8F07', title: 'Saturdays of Thunder' },
  { id: '8F08-flaming-moes-revised-table-draft', season: 3, ep: '8F08', title: 'Flaming Moes' },
  { id: '8F09-burns-verkaufen-der-kraftwerk-final-delivery', season: 3, ep: '8F09', title: 'Burns Verkaufen der Kraftwerk' },
  { id: '8F10-i-married-marge-revised-table-draft', season: 3, ep: '8F10', title: 'I Married Marge' },
  { id: '8F11-radio-bart-final-delivery', season: 3, ep: '8F11', title: 'Radio Bart' },
  { id: '8F12-lisa-the-greek-revised-table-draft', season: 3, ep: '8F12', title: 'Lisa the Greek' },
  { id: '8F13-homer-at-the-bat-table-draft', season: 3, ep: '8F13', title: 'Homer at the Bat' },
  { id: '8F14-homer-alone-final-delivery', season: 3, ep: '8F14', title: 'Homer Alone' },
  { id: '8F15-separate-vocations-final-delivery', season: 3, ep: '8F15', title: 'Separate Vocations' },
  { id: '8F16-bart-the-lover-table-draft', season: 3, ep: '8F16', title: 'Bart the Lover' },
  { id: '8F18-a-streetcar-named-marge-revised-table-draft', season: 3, ep: '8F18', title: 'A Streetcar Named Marge' },
  { id: '8F19-colonel-homer-revised-table-draft', season: 3, ep: '8F19', title: 'Colonel Homer' },
  { id: '8F20-black-widower-revised-table-draft', season: 3, ep: '8F20', title: 'Black Widower' },
  { id: '8F21-the-otto-show-table-draft', season: 3, ep: '8F21', title: 'The Otto Show' },
  { id: '8F22-barts-friend-falls-in-love-final-delivery', season: 3, ep: '8F22', title: 'Barts Friend Falls in Love' },
  { id: '8F23-brother-can-you-spare-two-dimes-final-delivery', season: 3, ep: '8F23', title: 'Brother Can You Spare Two Dimes' },
  { id: '8F24-kamp-krusty-table-draft', season: 3, ep: '8F24', title: 'Kamp Krusty' },

  // Season 4
  { id: 'the-simpsons-homer-the-heretic-table-draft', season: 4, ep: '9F01', title: 'Homer the Heretic' },
  { id: '9F02-lisa-the-beauty-queen-revised-table-draft', season: 4, ep: '9F02', title: 'Lisa the Beauty Queen' },
  { id: '9F03-itchy-scratchy-the-movie-table-draft', season: 4, ep: '9F03', title: 'Itchy Scratchy The Movie' },
  { id: '9-f-04-treehouse-of-horror-iii-final-delivery', season: 4, ep: '9F04', title: 'Treehouse of Horror III' },
  { id: '9F05-marge-gets-a-job-table-draft', season: 4, ep: '9F05', title: 'Marge Gets a Job' },
  { id: '9F06-new-kid-on-the-block-final-delivery', season: 4, ep: '9F06', title: 'New Kid on the Block' },
  { id: 'the-simpsons-mr.-plow-final-delivery', season: 4, ep: '9F07', title: 'Mr Plow' },
  { id: '9F08-lisas-first-word-revised-table-draft', season: 4, ep: '9F08', title: 'Lisas First Word' },
  { id: '9F09-homers-triple-bypass-final-delivery', season: 4, ep: '9F09', title: 'Homers Triple Bypass' },
  { id: '9F10-marge-vs.-the-monorail-revised-table-draft', season: 4, ep: '9F10', title: 'Marge vs the Monorail' },
  { id: '9F11-selmas-choice-table-draft', season: 4, ep: '9F11', title: 'Selmas Choice' },
  { id: '9F12-brother-from-the-same-planet-table-draft', season: 4, ep: '9F12', title: 'Brother from the Same Planet' },
  { id: '9F13-i-love-lisa-final-delivery', season: 4, ep: '9F13', title: 'I Love Lisa' },
  { id: '9F14-duffless-final-delivery', season: 4, ep: '9F14', title: 'Duffless' },
  { id: '9F15-last-exit-to-springfield-final-delivery', season: 4, ep: '9F15', title: 'Last Exit to Springfield' },
  { id: '9F16-the-front-table-draft', season: 4, ep: '9F16', title: 'The Front' },
  { id: '9F17-so-its-come-to-this-a-simpsons-clip-show-table-draft', season: 4, ep: '9F17', title: 'So Its Come to This A Simpsons Clip Show' },
  { id: '9F18-whacking-day-final-delivery', season: 4, ep: '9F18', title: 'Whacking Day' },
  { id: '9F19-krusty-gets-kancelled-final-delivery', season: 4, ep: '9F19', title: 'Krusty Gets Kancelled' },
  { id: '9F20-marge-in-chains-revised-table-draft', season: 4, ep: '9F20', title: 'Marge in Chains' },
  { id: '9F21-homers-barbershop-quartet-final-delivery', season: 4, ep: '9F21', title: 'Homers Barbershop Quartet' },
  { id: '9F22-cape-feare-table-draft', season: 4, ep: '9F22', title: 'Cape Feare' },

  // Season 5
  { id: 'the-simpsons-rosebud-table-draft', season: 5, ep: '1F01', title: 'Rosebud' },
  { id: '1F02-homer-goes-to-college-table-draft', season: 5, ep: '1F02', title: 'Homer Goes to College' },
  { id: '1F04-treehouse-of-horror-iv-final-1', season: 5, ep: '1F04', title: 'Treehouse of Horror IV' },
  { id: '1F05-barts-inner-child-record-draft', season: 5, ep: '1F05', title: 'Barts Inner Child' },
  { id: '1F06-boy-scoutz-n-the-hood-first-draft', season: 5, ep: '1F06', title: 'Boy-Scoutz N the Hood' },
  { id: 'TheSimpsonsSpringfieldScript', season: 5, ep: '1F08', title: 'Springfield' },
  { id: '1F09-homer-the-vigilante-table-draft', season: 5, ep: '1F09', title: 'Homer the Vigilante' },
  { id: '1F10-homer-and-apu-table-draft', season: 5, ep: '1F10', title: 'Homer and Apu' },
  { id: 'the-simpsons-lisa-vs.-malibu-stacy-final-1-draft', season: 5, ep: '1F12', title: 'Lisa vs Malibu Stacy' },
  { id: '1F13-deep-space-homer-table-draft', season: 5, ep: '1F13', title: 'Deep Space Homer' },
  { id: 'the-simpsons-lisas-rival-table-draft', season: 5, ep: '1F17', title: 'Lisas Rival' },
  { id: '1F18-sweet-seymour-skinners-baadasssss-song-first-draft', season: 5, ep: '1F18', title: 'Sweet Seymour Skinners Baadasssss Song' },
  { id: '1F19-hotel-homer-table-draft', season: 5, ep: '1F19', title: 'The Boy Who Knew Too Much' },
  { id: '1F22-bart-of-darkness-first-draft', season: 5, ep: '1F22', title: 'Bart of Darkness' },

  // Season 6
  { id: '2F02-sideshow-bob-roberts-table-draft', season: 6, ep: '2F02', title: 'Sideshow Bob Roberts' },
  { id: '2F03-treehouse-of-horror-v-table-draft', season: 6, ep: '2F03', title: 'Treehouse of Horror V' },
  { id: '2F05-lisa-on-ice-first-draft', season: 6, ep: '2F05', title: 'Lisa on Ice' },
  { id: '2F06-homer-badman-final-1', season: 6, ep: '2F06', title: 'Homer Badman' },
  { id: '2F07-grampa-vs.-sexual-inadequacy-table-draft', season: 6, ep: '2F07', title: 'Grampa vs Sexual Inadequacy' },
  { id: '2F13-bart-vs.-australia-first-draft', season: 6, ep: '2F13', title: 'Bart vs Australia' },
  { id: '2F15-lisas-wedding-table-draft', season: 6, ep: '2F15', title: 'Lisas Wedding' },
  { id: '2F16-who-shot-mr.-burns-part-one-final-1', season: 6, ep: '2F16', title: 'Who Shot Mr Burns Part One' },
  { id: '2F17-radioactive-man-record-draft', season: 6, ep: '2F17', title: 'Radioactive Man' },
  { id: '2F20-who-shot-mr.-burns-part-two-final-1', season: 6, ep: '2F20', title: 'Who Shot Mr Burns Part Two' },
  { id: '2F33-another-simpsons-clip-show-record-draft', season: 6, ep: '2F33', title: 'Another Simpsons Clip Show' },

  // Season 7
  { id: 'the-simpsons-home-sweet-homediddly-dum-doodily-final-3-draft', season: 7, ep: '3F01', title: 'Home Sweet Homediddly-Dum-Doodily' },
  { id: 'TheSimpsons-BSHS', season: 7, ep: '3F02', title: 'Bart Sells His Soul' },
  { id: '3f04-treehouse-of-horror-vi-final-i-draft', season: 7, ep: '3F04', title: 'Treehouse of Horror VI' },
  { id: 'the-simpsons-mother-simpson-table-draft', season: 7, ep: '3F06', title: 'Mother Simpson' },
  { id: 'the-simpsons-marge-be-not-proud-table-draft', season: 7, ep: '3F07', title: 'Marge Be Not Proud' },
  { id: '3f09-homers-new-neighbor-story-pitch', season: 7, ep: '3F09', title: 'Two Bad Neighbors' },
  { id: 'bart-the-fink-script', season: 7, ep: '3F12', title: 'Bart the Fink' },
  { id: '3F14-homer-the-smithers-table-draft', season: 7, ep: '3F14', title: 'Homer the Smithers' },
  { id: '3F18-22-short-films-about-springfield-final-1', season: 7, ep: '3F18', title: '22 Short Films About Springfield' },
  { id: 'summer-4-ft-2-script', season: 7, ep: '3F22', title: 'Summer of 4 Ft 2' },
  { id: '3f23-you-only-move-twice-record', season: 7, ep: '3F23', title: 'You Only Move Twice' },

  // Season 8
  { id: '4F02-treehouse-of-horror-vii-final-1', season: 8, ep: '4F02', title: 'Treehouse of Horror VII' },
  { id: 'the-simpsons-the-homer-they-fall-record-draft', season: 8, ep: '4F03', title: 'The Homer They Fall' },
  { id: 'the-simpsons-my-sister-my-sitter-table-draft', season: 8, ep: '4F13', title: 'My Sister My Sitter' },
  { id: '4F14-brother-from-another-series-final-4', season: 8, ep: '4F14', title: 'Brother from Another Series' },
  { id: 'the-simpsons-the-canine-mutiny-table-draft', season: 8, ep: '4F16', title: 'The Canine Mutiny' },
  { id: 'the-simpsons-the-secret-war-of-lisa-simpson-table-draft', season: 8, ep: '4F21', title: 'The Secret War of Lisa Simpson' },
  { id: 'the-simpsons-the-city-of-new-york-vs.-homer-simpson-record-draft', season: 8, ep: '4F22', title: 'The City of New York vs Homer Simpson' },
];

// Fetch metadata to find available files
async function getFileUrl(archiveId, preferHtml = true) {
  return new Promise((resolve, reject) => {
    const metaUrl = `https://archive.org/metadata/${archiveId}`;

    https.get(metaUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const meta = JSON.parse(data);
          const files = meta.files || [];

          // Priority: hocr.html > plain text > chocr
          let chosen = null;

          if (preferHtml) {
            // Look for HOCR HTML first (more readable)
            chosen = files.find(f => f.name.endsWith('_hocr.html'));
            // Then try uncompressed hocr
            if (!chosen) chosen = files.find(f => f.name.includes('hocr') && f.name.endsWith('.html'));
          }

          // Fallback to plain text (djvu.txt)
          if (!chosen) {
            chosen = files.find(f => f.name.endsWith('_djvu.txt'));
            if (!chosen) chosen = files.find(f => f.name.endsWith('.txt') && f.size > 1000);
          }

          // Last resort: chocr
          if (!chosen) {
            chosen = files.find(f => f.name.endsWith('_chocr.html.gz'));
          }

          if (chosen) {
            resolve({
              url: `https://archive.org/download/${archiveId}/${encodeURIComponent(chosen.name)}`,
              ext: chosen.name.endsWith('.html.gz') ? '.html.gz' :
                   chosen.name.endsWith('.html') ? '.html' :
                   '.txt'
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Download a file with redirect handling
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      https.get(requestUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(outputPath, buffer);
          resolve(buffer.length);
        });
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

async function main() {
  console.log('Simpsons Script Downloader');
  console.log(`Downloading ${SCRIPTS.length} scripts to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60) + '\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const script of SCRIPTS) {
    const baseFilename = `S${String(script.season).padStart(2, '0')}_${script.ep}_${script.title.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Check if any version already exists
    const existingFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith(baseFilename));
    if (existingFiles.length > 0) {
      console.log(`[SKIP] ${script.ep} ${script.title} (exists)`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`[FETCH] ${script.ep} ${script.title}... `);

      const fileInfo = await getFileUrl(script.id, true);
      if (!fileInfo) {
        console.log('No file found');
        failed++;
        continue;
      }

      const outputPath = path.join(OUTPUT_DIR, baseFilename + fileInfo.ext);
      const bytes = await downloadFile(fileInfo.url, outputPath);
      console.log(`OK (${Math.round(bytes / 1024)}KB)`);
      downloaded++;

      // Be nice to Archive.org
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Done! Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(console.error);
