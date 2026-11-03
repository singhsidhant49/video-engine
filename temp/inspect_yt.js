async function inspect(id) {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const t = await r.text();
  const desc = t.match(/"shortDescription":"(.*?)"/);
  console.log(`\n=== ${id} ===`);
  console.log(desc ? desc[1].slice(0, 300) : 'no desc');
}

async function main() {
  for (const id of ['7aEAS5E5vjg', '0530USUKZi8', 'W2O6BVlfX6o']) {
    await inspect(id);
  }
}

main();

