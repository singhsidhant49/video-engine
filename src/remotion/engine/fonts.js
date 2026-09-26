// Fonts load through @remotion/google-fonts, which blocks rendering (delayRender)
// until the font files are ready — no frame is captured with a fallback face.
import { loadFont as fraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as inter } from '@remotion/google-fonts/Inter';
import { loadFont as interTight } from '@remotion/google-fonts/InterTight';
import { loadFont as oswald } from '@remotion/google-fonts/Oswald';
import { loadFont as plexSans } from '@remotion/google-fonts/IBMPlexSans';
import { loadFont as plexMono } from '@remotion/google-fonts/IBMPlexMono';
import { loadFont as spaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as jetbrains } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as instrumentSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as manrope } from '@remotion/google-fonts/Manrope';
import { loadFont as archivo } from '@remotion/google-fonts/Archivo';

const latin = { subsets: ['latin'] };

fraunces('normal', { ...latin, weights: ['400', '600', '700'] });
fraunces('italic', { ...latin, weights: ['400', '600'] });
inter('normal', { ...latin, weights: ['400', '500', '600', '700', '800'] });
interTight('normal', { ...latin, weights: ['600', '700', '800'] });
oswald('normal', { ...latin, weights: ['500', '600', '700'] });
plexSans('normal', { ...latin, weights: ['400', '500', '600'] });
plexMono('normal', { ...latin, weights: ['400', '500'] });
spaceGrotesk('normal', { ...latin, weights: ['500', '600', '700'] });
jetbrains('normal', { ...latin, weights: ['400', '500', '700'] });
instrumentSerif('normal', { ...latin, weights: ['400'] });
instrumentSerif('italic', { ...latin, weights: ['400'] });
manrope('normal', { ...latin, weights: ['400', '500', '600', '700'] });
archivo('normal', { ...latin, weights: ['600', '700', '800', '900'] });

export const fontStack = (family) => `'${family}', 'Inter', system-ui, sans-serif`;
