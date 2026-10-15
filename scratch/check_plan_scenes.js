import fs from 'fs';
const plan = JSON.parse(fs.readFileSync('D:/projects/videogenerator/renders/runs/video-2026-10-09T03-14-22/plan.json', 'utf8'));

for (const sc of plan.scenes) {
  if (sc.id === 's13' || sc.id === 's16' || sc.id === 's05' || sc.id === 's06' || sc.id === 's09' || sc.id === 's14' || sc.id === 's15' || sc.id === 's19') {
    console.log('=== SCENE:', sc.id, '| kind:', sc.kind, '| purpose:', sc.purpose);
    console.log('Narration:', sc.narration);
    console.log('Visual:', sc.visual);
    console.log('imageQueries:', sc.imageQueries);
  }
}
