import React from 'react';
import { Composition } from 'remotion';
import { DynamicShorts } from './compositions/DynamicShorts.jsx';

export const RemotionRoot = () => {
  return (
    <>
      {/* 9:16 Vertical Shorts / Reels Composition */}
      <Composition
        id="DynamicShorts"
        component={DynamicShorts}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: 'React Server Components vs Client Components',
          theme: 'dark-neon',
          format: 'shorts',
          audioUrl: '',
          subtitles: [
            { id: 1, text: 'STOP USING USEEFFECT', startFrame: 0, endFrame: 40 },
            { id: 2, text: 'FOR DERIVED STATE', startFrame: 41, endFrame: 80 },
            { id: 3, text: 'CALCULATE IT INLINE', startFrame: 81, endFrame: 150 },
            { id: 4, text: 'INSTANT PERFORMANCE BOOST', startFrame: 151, endFrame: 300 },
          ],
          scenes: [
            {
              id: 1,
              type: 'headline',
              heading: 'React Performance Anti-Pattern',
              subheading: 'Stop overusing useEffect hooks!',
              highlights: ['Eliminates extra renders', 'Clean functional pattern'],
              accentColor: '#38bdf8',
              startFrame: 0,
              endFrame: 100,
            },
            {
              id: 2,
              type: 'code',
              heading: '❌ Bad Practice',
              subheading: 'Extra render cycles',
              code: `// Redundant state\nconst [full, setFull] = useState('');\nuseEffect(() => {\n  setFull(first + ' ' + last);\n}, [first, last]);`,
              language: 'javascript',
              accentColor: '#f43f5e',
              startFrame: 100,
              endFrame: 200,
            },
            {
              id: 3,
              type: 'stats_highlight',
              heading: 'Instant Speedup',
              statLabel: 'Render Reduction',
              statValue: '-50%',
              subheading: 'Calculated inline on render pass',
              accentColor: '#10b981',
              startFrame: 200,
              endFrame: 300,
            },
          ],
        }}
      />

      {/* 16:9 Landscape Composition */}
      <Composition
        id="LandscapeExplainer"
        component={DynamicShorts}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'System Architecture Breakdown',
          theme: 'cyber-purple',
          format: 'landscape',
          audioUrl: '',
          subtitles: [
            { id: 1, text: 'HOW UBER SCALED TO', startFrame: 0, endFrame: 50 },
            { id: 2, text: '100 MILLION USERS', startFrame: 51, endFrame: 120 },
            { id: 3, text: 'EVENT DRIVEN QUEUES', startFrame: 121, endFrame: 200 },
            { id: 4, text: 'SUB-10MS LATENCY', startFrame: 201, endFrame: 300 },
          ],
          scenes: [
            {
              id: 1,
              type: 'concept_card',
              heading: 'Distributed System Architecture',
              subheading: 'How Modern Tech Giants Scale Backends',
              highlights: ['Kafka Event Streaming', 'Redis Key-Value Caching', 'Kubernetes Autoscaling'],
              accentColor: '#a855f7',
              startFrame: 0,
              endFrame: 150,
            },
            {
              id: 2,
              type: 'stats_highlight',
              heading: 'Throughput Impact',
              statLabel: 'Message Queue Capacity',
              statValue: '1M req/sec',
              subheading: 'Decoupled event-driven microservices',
              accentColor: '#ec4899',
              startFrame: 150,
              endFrame: 300,
            },
          ],
        }}
      />
    </>
  );
};
