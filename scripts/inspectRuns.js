import fs from 'fs';
import path from 'path';

function inspectRun(runName) {
  const runDir = path.join('renders/runs', runName);
  if (!fs.existsSync(path.join(runDir, 'assets.json'))) {
    console.log(`Run ${runName} does not exist or has no assets.json`);
    return;
  }
  const assetsData = JSON.parse(fs.readFileSync(path.join(runDir, 'assets.json'), 'utf8'));
  console.log(`\n######################################################################`);
  console.log(`RUN: ${runName}`);
  console.log(`######################################################################`);
  assetsData.scenes?.forEach((s, idx) => {
    (s.requests || []).forEach((req, ridx) => {
      console.log(`Scene ${s.sceneId} Req ${req.requestId} [concept: ${req.concept}]:`);
      console.log(`  Candidate: ${req.selectedCandidate?.candidateId || req.selectedCandidate?.id}`);
      console.log(`  Provider: ${req.selectedCandidate?.provider}`);
      console.log(`  Label: ${req.selectedCandidate?.label}`);
      console.log(`  Query: ${req.selectedCandidate?.query}`);
      console.log(`  Reasons: ${JSON.stringify(req.selectedCandidate?.selectionReasons || req.selectedCandidate?.scores?.selectionReasons)}`);
    });
  });
}

inspectRun('video-2026-10-02T14-17-32');
inspectRun('video-2026-10-02T13-50-57');
