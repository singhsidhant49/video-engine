import fs from 'node:fs/promises';

async function generateSpeech(text, outputFile = 'output.mp3') {
  try {
    console.log('Sending text to Kokoro TTS...');
    const response = await fetch('http://localhost:8880/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-needed',
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: 'af_bella',
        response_format: 'mp3',
        speed:0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS Failed with status: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(outputFile, buffer);
    console.log(`Success! Audio saved as ${outputFile}`);
  } catch (error) {
    console.error('Error generating audio:', error.message);
  }
}

generateSpeech('React (also known as React.js or ReactJS) is a free and open-source front-end JavaScript library used for building dynamic, interactive user interfaces (UIs). Developed by a software engineer at Facebook in 2013, it is primarily used to build the visual elements of single-page web applications (SPAs) and native mobile apps.');