// Template code for Bubble Pop Text
/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * 
 * A composable text scene that renders each character inside a bubble container, then pops them in sequence using useCurrentFrame() and interpolate(). Drop this component into any Sequence to add a playful character-reveal moment to an intro, explainer, or social clip.

Customise the pop timing, bubble color, and font size through props. The component uses pure Remotion hooks - no external animation libraries - so it renders identically in the browser preview and in server-side video renders.
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function BubblePopText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = "HELLO";

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        gap: "0.5rem",
      }}
    >
      {text.split("").map((char, i) => {
        const delay = i * 5;
        const scale = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: {
            damping: 8,
            mass: 0.3,
            stiffness: 100,
          },
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `scale(${scale})`,
              fontSize: "4rem",
              fontWeight: 400,
              color: "white",
              border: "4px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "50%",
              width: "100px",
              height: "100px",
              lineHeight: "92px",
              textAlign: "center",
              background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
              boxShadow: "0 4px 15px rgba(59, 130, 246, 0.5)",
              backdropFilter: "blur(8px)",
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}




/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Renders text that scales from 0 to full size with a spring overshoot, giving each word a punchy entrance. Built with spring() and useCurrentFrame() so the physics feel natural and the timing stays frame-accurate across any FPS.

Use this as a title card, section header, or call-to-action scene. Adjust spring config (damping, mass, stiffness) and font styles through props to match your brand.
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export default function PoppingText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text = "BINGO!".split("");

  const colors = [
    "#1e3a8a", // teal/aqua blue
    "#3b82f6", // dark blue-green
    "#A9D6E5", // light blue
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {text.map((char, i) => {
        const delay = i * 7;
        const colorIndex = i % colors.length;

        // Simple scale and opacity animation
        const scale = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: { mass: 0.4, damping: 8, stiffness: 100 },
        });

        const opacity = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: { mass: 0.3, damping: 8, stiffness: 100 },
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              color: colors[colorIndex],
              fontSize: "8rem",
              fontWeight: 400,
              margin: "0 0.1em",
              textShadow: `0 0 10px ${colors[colorIndex]}80,
                          -2px -2px 0 #fff, 
                          2px -2px 0 #fff, 
                          -2px 2px 0 #fff, 
                          2px 2px 0 #fff`,
              transform: `scale(${scale})`,
              fontFamily: "'Impact', 'Arial Black', sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        );
      })}
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function FloatingBubbleText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const float = Math.sin(frame / 30) * 20;
  const scale = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 12,
      mass: 0.5,
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${float}px) scale(${scale})`,
      }}
    >
      <div
        style={{
          fontSize: "4.5rem",
          fontWeight: 400,
          color: "white",
          padding: "2rem 3.5rem",
          borderRadius: "24px",
          background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
          border: "3px solid transparent",
          backgroundClip: "padding-box",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(30, 58, 138, 0.2)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-3px",
            background: "linear-gradient(45deg, cyan, magenta)",
            zIndex: -1,
            margin: "-2px",
            animation: `rotate 3s linear infinite`,
          }}
        />
        Floating
      </div>
    </div>
  );
}

/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * 
 * A small text chip that floats upward with a gentle sine-wave wobble, built entirely with useCurrentFrame() and Math.sin(). Ideal for floating labels, callout tags, or ambient text overlays in product demos and explainer videos.

The chip's float speed, amplitude, and text content are all configurable. Because it uses only Remotion's frame-based math, the animation is fully deterministic and renders consistently in both preview and server-side output.
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function FloatingBubbleText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const float = Math.sin(frame / 30) * 20;
  const scale = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 12,
      mass: 0.5,
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${float}px) scale(${scale})`,
      }}
    >
      <div
        style={{
          fontSize: "4.5rem",
          fontWeight: 400,
          color: "white",
          padding: "2rem 3.5rem",
          borderRadius: "24px",
          background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
          border: "3px solid transparent",
          backgroundClip: "padding-box",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(30, 58, 138, 0.2)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-3px",
            background: "linear-gradient(45deg, cyan, magenta)",
            zIndex: -1,
            margin: "-2px",
            animation: `rotate 3s linear infinite`,
          }}
        />
        Floating
      </div>
    </div>
  );
}


/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Applies a continuous scale pulse to text using a sine wave driven by useCurrentFrame(), creating a breathing rhythm that draws attention without overwhelming the scene. Perfect for highlighting key words, prices, or stats that need to stand out.

Adjust pulse intensity, speed, and color to match your project. The effect loops seamlessly, making it suitable for background text, looping social ads, or any scene that needs subtle continuous motion.
 */

"use client";

import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export default function PulsingText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = "Pulse";

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        gap: "1rem",
      }}
    >
      {text.split("").map((char, i) => {
        const delay = i * 6;
        const pulse = interpolate(
          ((frame - delay) % 30) / 30,
          [0, 0.5, 1],
          [1, 1.2, 1],
          {
            extrapolateRight: "clamp",
          }
        );

        const opacity = interpolate(
          ((frame - delay) % 30) / 30,
          [0, 0.5, 1],
          [0.5, 1, 0.5],
          {
            extrapolateRight: "clamp",
          }
        );

        return (
          <div
            key={i}
            style={{
              position: "relative",
              transform: `scale(${pulse})`,
            }}
          >
            <span
              style={{
                fontSize: "5rem",
                fontWeight: 400,
                color: "white",
                position: "relative",
                zIndex: 2,
              }}
            >
              {char}
            </span>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "80px",
                height: "80px",
                background: "rgba(255, 255, 255, 0.2)",
                borderRadius: "50%",
                filter: "blur(20px)",
                opacity: opacity,
                zIndex: 1,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}




/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 Description
Reveals text one character at a time using useCurrentFrame() and interpolate() to control per-character opacity and vertical offset. A versatile building block for title cards, opening sequences, or any scene that needs text to appear progressively.

Customise reveal speed, direction, font size, and color. The frame-based approach means timing is precise and deterministic, rendering consistently across browser preview and server-side video output.*/

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function AnimatedText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text = "Hello Remotion".split("");

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
      }}
    >
      {text.map((char, i) => {
        const delay = i * 5;

        const opacity = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: { mass: 0.5, damping: 10 },
        });

        const y = spring({
          frame: frame - delay,
          fps,
          from: -50,
          to: 0,
          config: { mass: 0.5, damping: 10 },
        });

        const rotate = spring({
          frame: frame - delay,
          fps,
          from: -180,
          to: 0,
          config: { mass: 0.5, damping: 12 },
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              color: "white",
              fontSize: "5rem",
              fontWeight: 400,
              transform: `translateY(${y}px) rotate(${rotate}deg)`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        );
      })}
    </div>
  );
}




/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉Description
Drops text in from above with a spring-based bounce using spring() from Remotion, giving titles and headings an energetic entrance. The bounce physics — overshoot, settle, and damping — are controlled through spring config for a natural feel.

Use this for intro titles, section headers, or any moment that needs impact. Compose it inside a Sequence with other scenes for a complete video. Adjustable text, colors, and spring parameters via props.
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function BounceText() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame,
    fps,
    from: -100,
    to: 0,
    config: {
      damping: 100,
      mass: 1,
      stiffness: 200,
    },
  });

  const fadeIn = spring({
    frame: frame - 15, // Slight delay for subtitle
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 100,
      mass: 1,
    },
  });

  const scaleIn = spring({
    frame,
    fps,
    from: 0.5,
    to: 0.8,
    config: {
      damping: 100,
      mass: 1,
      stiffness: 200,
    },
  });

  const containerFadeIn = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 100,
      mass: 1,
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${scaleIn})`,
        width: "80%",
        padding: "2rem 3rem",
        background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
        borderRadius: "20px",
        opacity: containerFadeIn,
      }}
    >
      <div
        style={{
          transform: `translateX(${slideIn}%)`,
        }}
      >
        <h1
          style={{
            fontSize: "3.5rem",
            fontWeight: 400,
            color: "white",
            margin: 0,
            lineHeight: "1",
            fontFamily: "Inter, sans-serif",
            textShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)",
          }}
        >
          Start Building
        </h1>
        <h2
          style={{
            fontSize: "1.8rem",
            color: "white",
            margin: 0,
            marginTop: "0.75rem",
            fontWeight: 400,
            opacity: fadeIn,
            fontFamily: "Inter, sans-serif",
            textShadow: "0px 2px 4px rgba(0, 0, 0, 0.2)",
          }}
        >
          Theres never been a better time
        </h2>
      </div>
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { interpolate, useCurrentFrame } from "remotion";

export default function TypewriterSubtitle() {
  const frame = useCurrentFrame();

  const text = "I like typing...";
  const visibleCharacters = Math.floor(
    interpolate(frame, [0, 45], [0, text.length], {
      extrapolateRight: "clamp",
    })
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {text
        .slice(0, visibleCharacters)
        .split("")
        .map((char, index) => {
          const hue = 210 + (index * 40) / text.length;
          const isGlitching = frame % 30 === 0 && Math.random() > 0.7;

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                fontFamily: "'Courier New', monospace",
                fontSize: "3rem",
                fontWeight: 400,
                color: `white`,

                transition: "all 0.05s ease-out",
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          );
        })}
      <span
        style={{
          fontSize: "3rem",
          color: "#60a5fa",
          opacity: frame % 15 < 7 ? 1 : 0,

          marginLeft: "0.2rem",
          verticalAlign: "middle",
        }}
      >
        ▌
      </span>
    </div>
  );
}


/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Renders text one character at a time with a blinking cursor, replicating the classic typewriter effect using useCurrentFrame() and string slicing. Ideal for subtitle overlays, code demonstrations, chatbot-style reveals, or any scene where text should appear as if being typed live.

Adjust typing speed (characters per frame), cursor style, and text content. The component is a self-contained Remotion scene — drop it into any Sequence for instant typewriter captions.
 */

"use client";

import { interpolate, useCurrentFrame } from "remotion";

export default function TypewriterSubtitle() {
  const frame = useCurrentFrame();

  const text = "I like typing...";
  const visibleCharacters = Math.floor(
    interpolate(frame, [0, 45], [0, text.length], {
      extrapolateRight: "clamp",
    })
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {text
        .slice(0, visibleCharacters)
        .split("")
        .map((char, index) => {
          const hue = 210 + (index * 40) / text.length;
          const isGlitching = frame % 30 === 0 && Math.random() > 0.7;

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                fontFamily: "'Courier New', monospace",
                fontSize: "3rem",
                fontWeight: 400,
                color: `white`,

                transition: "all 0.05s ease-out",
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          );
        })}
      <span
        style={{
          fontSize: "3rem",
          color: "#60a5fa",
          opacity: frame % 15 < 7 ? 1 : 0,

          marginLeft: "0.2rem",
          verticalAlign: "middle",
        }}
      >
        ▌
      </span>
    </div>
  );
}




/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Generates smooth, flowing SVG wave shapes that undulate over time using useCurrentFrame() and Math.sin() at multiple frequencies. Use it as a full-screen background layer, a section divider, or an ambient texture underneath other content.

Wave colors, amplitude, frequency, and speed are all configurable. The animation loops seamlessly and uses only Remotion hooks — no CSS animations — so it renders identically in browser preview and server-side video output.
 */

"use client";

import { useCurrentFrame, useVideoConfig } from "remotion";

export default function LiquidWave() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const numberOfPoints = 50;
  const points = Array.from({ length: numberOfPoints + 1 }).map((_, i) => {
    const x = (i / numberOfPoints) * width;
    const waveHeight = Math.sin(frame / 20 + i / 5) * 50;
    const y = height / 2 + waveHeight;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} style={{ background: "#111827" }}>
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d={`M 0,${height} ${points.join(" ")} ${width},${height} Z`}
        fill="url(#gradient)"
        style={{
          filter: "blur(10px)",
        }}
      />
    </svg>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉

QQQQRRRRRSSSSSTTTTTUUUUUVVVVVWWWWWXXXXXYYYYYZZZZ
Open with AI
ChatGPT
Claude
Gemini
Description
Renders columns of falling characters that cycle through random glyphs each frame, recreating the iconic digital rain effect. Built with useCurrentFrame() and useVideoConfig() for frame-perfect column timing. Use as a full-screen background behind titles, intros, or tech-themed content.

Adjust character set, column density, fall speed, and color. The effect is fully deterministic — every frame produces the same output — making it safe for server-side rendering and reproducible across runs. */

"use client";

import { random, useCurrentFrame, useVideoConfig } from "remotion";

export default function MatrixRain() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";
  const columns = Math.floor(width / 20);
  const drops = Array.from({ length: columns }).map((_, i) => ({
    x: i * 20,
    y: random(i) * height,
    speed: random(i) * 5 + 5,
    char: characters[Math.floor(random(i) * characters.length)],
  }));

  return (
    <div
      style={{
        width,
        height,
        background: "linear-gradient(45deg, #0a1933, #1e40af)",
        position: "relative",
      }}
    >
      {drops.map((drop, i) => {
        const y = (drop.y + frame * drop.speed) % height;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: drop.x,
              top: y,
              color: `rgba(255, 255, 255, ${1 - (y / height) * 0.6})`,
              fontSize: "25px",
              fontFamily: "monospace",
              fontWeight: 400,
              textShadow: "0 0 8px rgba(59, 130, 246, 0.9)",
            }}
          >
            {characters[Math.floor((frame + i) / 5) % characters.length]}
          </div>
        );
      })}
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Rotates a card 180 degrees on the Y-axis using CSS perspective and rotateY driven by interpolate(), revealing back-face content halfway through. Use it for before/after reveals, product feature highlights, flashcard-style education content, or any scene that needs a dramatic content swap.

Front and back content are separate React elements, so you can put any layout on either side. Flip speed, perspective depth, and card dimensions are all configurable through props
 */

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function CardFlip() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rotation = spring({
    frame,
    fps,
    from: 0,
    to: 360,
    config: {
      damping: 15,
      mass: 0.5,
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        perspective: "1000px",
      }}
    >
      <div
        style={{
          width: "300px",
          height: "400px",
          transform: `translate(-50%, -50%) rotateY(${rotation}deg)`,
          transformStyle: "preserve-3d",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            backfaceVisibility: "hidden",
            background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
            borderRadius: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "2rem",
            fontWeight: 400,
            color: "white",
          }}
        >
          Remotion 👋
        </div>
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            backfaceVisibility: "hidden",
            background: "linear-gradient(45deg, #1e3a8a, #3b82f6)",
            borderRadius: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "2rem",
            fontWeight: 400,
            color: "white",
            transform: "rotateY(180deg)",
          }}
        >
          Back
        </div>
      </div>
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 

Description
Renders a row of vertical bars that oscillate in height using useCurrentFrame() and Math.sin() with per-bar phase offsets, simulating a real-time audio waveform. Use as a visual layer in music videos, podcast intros, or any audio-focused content.

Bar count, colors, max height, and oscillation speed are configurable. Uses useVideoConfig() for responsive sizing. Pure Remotion hooks ensure the waveform renders identically in preview and server-side outp

*/

"use client";

import { random, useCurrentFrame, useVideoConfig } from "remotion";

export default function SoundWave() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const BAR_COUNT = 40;
  const bars = Array.from({ length: BAR_COUNT }).map((_, i) => {
    const seed = i * 1000;
    const height =
      Math.abs(Math.sin(frame / 10 + i / 2)) * 100 + random(seed) * 50;

    return {
      height,
      hue: (i / BAR_COUNT) * 180 + frame,
    };
  });

  return (
    <div
      style={{
        width,
        height,

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        backdropFilter: "blur(8px)",
        boxShadow: "inset 0 0 100px rgba(59, 130, 246, 0.2)",
      }}
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            width: "12px",
            height: `${bar.height}px`,
            background: `white`,
            borderRadius: "6px",
            transition: "height 0.1s ease",
            boxShadow: `0 0 10px rgba(59, 130, 246, 0.6)`,
          }}
        />
      ))}
    </div>
  );
}


/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 Description
Reveals list items one by one with staggered fade-and-slide animations driven by interpolate() and per-item delay offsets. A ready-made scene for feature lists, step-by-step tutorials, agenda slides, or any content that benefits from sequential item reveals.

List items, stagger delay, slide direction, and styles are all customisable through props. The component is a self-contained Remotion scene that composes cleanly inside any Sequence.*/

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function AnimatedList() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sample list items
  const items = [
    { name: "Item One", color: "#3b82f6" },
    { name: "Item Two", color: "#60a5fa" },
    { name: "Item Three", color: "#93c5fd" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        maxWidth: "600px",
        padding: "2rem",
      }}
    >
      {items.map((item, i) => {
        const delay = i * 5;

        // Slide in from left
        const slideX = spring({
          frame: frame - delay,
          fps,
          from: -100,
          to: 0,
          config: {
            damping: 12,
            mass: 0.5,
          },
        });

        // Fade in
        const opacity = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: {
            damping: 12,
            mass: 0.5,
          },
        });

        // Scale up
        const scale = spring({
          frame: frame - delay,
          fps,
          from: 0.3,
          to: 1,
          config: {
            damping: 12,
            mass: 0.5,
          },
        });

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1rem",
              transform: `translateX(${slideX}px) scale(${scale})`,
              opacity,
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: item.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              }}
            />
            <span
              style={{
                color: "white",
                fontSize: "3.5rem",
                fontWeight: 400,
              }}
            >
              {item.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 * Description
Renders an SVG circle that fills from 0% to a target value using stroke-dashoffset driven by interpolate(), with a percentage number counting up in the centre. Use it for KPI highlights, loading sequences, goal trackers, or any data point that maps to a percentage.

Target value, ring color, stroke width, and animation duration are configurable. A rotating dot and pulse effect add visual polish. Built with useCurrentFrame() and useVideoConfig() for frame-accurate, deterministic rendering.
 */

"use client";

import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export default function CircularProgress() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate progress based on frame
  const progress = interpolate(frame % 90, [0, 90], [0, 100], {
    extrapolateRight: "clamp",
  });

  // Calculate rotation for the loading effect
  const rotation = (frame * 4) % 360;

  // Calculate radius and circumference
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Pulse effect
  const pulse = 1 + Math.sin(frame / 10) * 0.05;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "300px",
          height: "300px",
          transform: `scale(${pulse})`,
        }}
      >
        {/* Background circle */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 200"
          style={{
            position: "absolute",
            transform: "rotate(-90deg)",
          }}
        >
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="12"
          />
        </svg>

        {/* Progress circle */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 200"
          style={{
            position: "absolute",
            transform: "rotate(-90deg)",
          }}
        >
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />

          <defs>
            <linearGradient
              id="progressGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
          </defs>
        </svg>

        {/* Rotating dots */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 200"
          style={{
            position: "absolute",
            transform: `rotate(${rotation}deg)`,
          }}
        >
          <circle cx="100" cy="20" r="8" fill="#3b82f6" />
        </svg>

        {/* Percentage text */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "3rem",
            fontWeight: 400,
            color: "white",
          }}
        >
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}




/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉Description
Spawns a configurable number of particles from a centre point that fly outward with randomised velocity and fade using useCurrentFrame() and interpolate(). Use as a standalone impact moment, a transition punctuation, or layered behind a title for a dramatic entrance.

Particle count, spread radius, colors, and decay timing are all adjustable. The animation is deterministic — seeded random values ensure identical output across renders — making it reliable for server-side video generation.
 */

"use client";

import { random, spring, useCurrentFrame, useVideoConfig } from "remotion";

const PARTICLE_COUNT = 150;
const TEXT = "BOOM!";

export default function ParticleExplosion() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const particles = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const rotationSpeed = 0.02;
    const rotatingAngle = baseAngle + frame * rotationSpeed;

    const scale = spring({
      frame,
      fps,
      from: 0,
      to: random(i) * 1.2 + 0.3,
      config: { mass: 0.3, damping: 12 },
    });

    const distance = spring({
      frame,
      fps,
      from: 0,
      to: 180 + random(i) * 40,
      config: { mass: 0.4, damping: 10 },
    });

    const x = Math.cos(rotatingAngle) * distance;
    const y = Math.sin(rotatingAngle) * distance;
    const opacity = Math.max(0, 1 - frame / 90);

    return { x, y, opacity, scale };
  });

  return (
    <div style={{ width, height, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${Math.min(1, frame / 10)})`,
          fontSize: "48px",
          fontWeight: 400,
          color: "white",
          textShadow: "0 0 10px rgba(255,255,255,0.5)",
          zIndex: 2,
        }}
      >
        {TEXT}
      </div>

      {particles.map((particle, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) translate(${particle.x}px, ${particle.y}px) scale(${particle.scale})`,
            width: "12px",
            height: "12px",
            backgroundColor: `hsl(${
              200 + (i / PARTICLE_COUNT) * 40
            }, 85%, 70%)`,
            borderRadius: "50%",
            opacity: particle.opacity,
            boxShadow: "0 0 5px rgba(255,255,255,0.3)",
          }}
        />
      ))}
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
Description
Draws an SVG polyline from left to right using animated stroke-dashoffset, with data point circles appearing as the line reaches them. Use for revenue trends, user growth, time-series data, or any metric that changes over a continuous axis.

Data points, line color, point color, axis labels, and chart title are configurable. The drawing animation uses interpolate() for smooth left-to-right reveal, and each data point fades in on a staggered delay for a polished sequential effect.

*/

"use client";

import { interpolate, useCurrentFrame } from "remotion";

export default function LineChart() {
  const frame = useCurrentFrame();

  const data = [
    { x: 0, y: 25, label: "Jan" },
    { x: 1, y: 40, label: "Feb" },
    { x: 2, y: 35, label: "Mar" },
    { x: 3, y: 55, label: "Apr" },
    { x: 4, y: 50, label: "May" },
    { x: 5, y: 70, label: "Jun" },
    { x: 6, y: 65, label: "Jul" },
    { x: 7, y: 80, label: "Aug" },
    { x: 8, y: 75, label: "Sep" },
    { x: 9, y: 90, label: "Oct" },
  ];

  const chartWidth = 900;
  const chartHeight = 500;
  const padding = 70;

  const xScale = (x: number) =>
    (x / (data.length - 1)) * (chartWidth - padding * 2) + padding;
  const yScale = (y: number) =>
    chartHeight - padding - (y / 100) * (chartHeight - padding * 2);

  // Build polyline points
  const points = data.map((d) => `${xScale(d.x)},${yScale(d.y)}`).join(" ");

  // Calculate total polyline length (approximate)
  let totalLength = 0;
  for (let i = 1; i < data.length; i++) {
    const dx = xScale(data[i].x) - xScale(data[i - 1].x);
    const dy = yScale(data[i].y) - yScale(data[i - 1].y);
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  // Animate line drawing
  const dashOffset = interpolate(frame, [0, 60], [totalLength, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        background: "linear-gradient(to bottom right, #111827, #1f2937)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: `${chartWidth}px`,
          height: `${chartHeight}px`,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          padding: "20px",
        }}
      >
        <svg width={chartWidth} height={chartHeight}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((val) => (
            <line
              key={`grid-${val}`}
              x1={padding}
              y1={yScale(val)}
              x2={chartWidth - padding}
              y2={yScale(val)}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100].map((val) => (
            <text
              key={`y-${val}`}
              x={padding - 15}
              y={yScale(val) + 5}
              textAnchor="end"
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
            >
              {val}
            </text>
          ))}

          {/* X-axis line */}
          <line
            x1={padding}
            y1={chartHeight - padding}
            x2={chartWidth - padding}
            y2={chartHeight - padding}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
          />

          {/* Y-axis line */}
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={chartHeight - padding}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
          />

          {/* X-axis labels */}
          {data.map((point, i) => (
            <text
              key={`x-label-${i}`}
              x={xScale(point.x)}
              y={chartHeight - padding + 25}
              textAnchor="middle"
              fill="rgba(255,255,255,0.8)"
              fontSize="13"
              fontWeight="400"
            >
              {point.label}
            </text>
          ))}

          {/* Animated polyline */}
          <polyline
            points={points}
            fill="none"
            stroke="#4361ee"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={dashOffset}
          />

          {/* Data points */}
          {data.map((point, i) => {
            const pointProgress = interpolate(
              frame,
              [5 + i * 6, 10 + i * 6],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <circle
                key={`point-${i}`}
                cx={xScale(point.x)}
                cy={yScale(point.y)}
                r={5 * pointProgress}
                fill="#f72585"
                stroke="white"
                strokeWidth="2"
                opacity={pointProgress}
              />
            );
          })}
        </svg>

        {/* Chart title */}
        <div
          style={{
            position: "absolute",
            top: "25px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "28px",
            fontWeight: 400,
            color: "white",
            textShadow: "0 2px 4px rgba(0,0,0,0.3)",
            letterSpacing: "-0.5px",
          }}
        >
          Revenue Growth
        </div>
      </div>
    </div>
  );
}



/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
Description
Renders SVG circle segments that appear one by one using stroke-dasharray animation driven by interpolate(), building up a complete pie chart. Each segment gets its own color and label. Use for market share breakdowns, budget allocations, survey results, or any proportional data.

Segment data, colors, and legend labels are configurable. A dark centre circle provides visual balance. The staggered reveal makes each data slice feel intentional — ideal for presentation videos and data storytelling.
 */

"use client";

import { interpolate, useCurrentFrame } from "remotion";

export default function PieChart() {
  const frame = useCurrentFrame();

  const segments = [
    { label: "Product A", value: 35, color: "#4361ee" },
    { label: "Product B", value: 25, color: "#7209b7" },
    { label: "Product C", value: 20, color: "#f72585" },
    { label: "Product D", value: 12, color: "#4cc9f0" },
    { label: "Product E", value: 8, color: "#a855f7" },
  ];

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const cx = 300;
  const cy = 220;
  const radius = 140;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        background: "linear-gradient(to bottom right, #111827, #1f2937)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "600px",
          height: "520px",
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          padding: "20px",
        }}
      >
        {/* Title */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "28px",
            fontWeight: 400,
            color: "white",
            textShadow: "0 2px 4px rgba(0,0,0,0.3)",
            letterSpacing: "-0.5px",
          }}
        >
          Market Share
        </div>

        <svg width={600} height={440} style={{ marginTop: "10px" }}>
          {/* Pie segments */}
          {segments.map((segment, i) => {
            const segmentLength = (segment.value / total) * circumference;
            const currentOffset = cumulativeOffset;
            cumulativeOffset += segmentLength;

            const segmentProgress = interpolate(
              frame,
              [i * 10, 15 + i * 10],
              [0, 1],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
            );

            const animatedLength = segmentLength * segmentProgress;

            return (
              <circle
                key={`seg-${i}`}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="80"
                strokeDasharray={`${animatedLength} ${circumference - animatedLength}`}
                strokeDashoffset={-currentOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}

          {/* Center circle for visual balance */}
          <circle cx={cx} cy={cy} r={60} fill="#111827" />
        </svg>

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            bottom: "25px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "20px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {segments.map((segment, i) => {
            const legendOpacity = interpolate(
              frame,
              [5 + i * 10, 15 + i * 10],
              [0, 1],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
            );

            return (
              <div
                key={`legend-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: legendOpacity,
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: segment.color,
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: "13px",
                  }}
                >
                  {segment.label} ({segment.value}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}




// Description
// Applies a rhythmic zoom-in/zoom-out pulse to content using a sine wave on scale driven by useCurrentFrame(), creating a breathing zoom that adds visual rhythm to static content. Use for hero images, product shots, or ambient background motion.

// Pulse speed, intensity, and target content are configurable. The looping animation creates seamless visual motion without requiring camera movement or complex keyframing.
  "use client";
import React from "react";
import Image from "next/image";
interface ZoomPulseProps {
  imageUrl?: string;
  duration?: number;
  minScale?: number;
  maxScale?: number;
}

export const ZoomPulse: React.FC<ZoomPulseProps> = ({
  imageUrl = "https://images.pexels.com/photos/1726310/pexels-photo-1726310.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  duration = 4,
  minScale = 1,
  maxScale = 1.1,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "black",
        overflow: "hidden",
      }}
    >
      <Image
        src={imageUrl}
        width={800}
        height={450}
        alt="Zoom Pulse"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          animation: `zoomPulse ${duration}s ease-in-out infinite`,
        }}
      />
      <style jsx>{`
        @keyframes zoomPulse {
          0%,
          100% {
            transform: scale(${minScale});
          }
          50% {
            transform: scale(${maxScale});
          }
        }
      `}</style>
    </div>
  );
};

export default ZoomPulse;


// Description
// Moves foreground and background layers at different speeds using interpolate() on translateX, creating a parallax depth effect. The differential motion adds a cinematic sense of depth to flat content, making it ideal for landscape shots, product showcases, or stylised scene transitions.

// Layer speeds, pan direction, and content for each layer are configurable. The animation is frame-driven and deterministic, rendering identically in preview and server-side output.
"use client";
import React from "react";
import Image from "next/image";
interface ParallaxPanProps {
  imageUrl?: string;
  duration?: number;
  direction?: "left-right" | "right-left" | "top-bottom" | "bottom-top";
  scale?: number;
}

export const ParallaxPan: React.FC<ParallaxPanProps> = ({
  imageUrl = "https://images.pexels.com/photos/1644724/pexels-photo-1644724.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  duration = 15,
  direction = "left-right",
  scale = 1.2,
}) => {
  const getKeyframes = () => {
    switch (direction) {
      case "left-right":
        return `
          0% { transform: translateX(0) scale(${scale}); }
          100% { transform: translateX(-20%) scale(${scale}); }
        `;
      case "right-left":
        return `
          0% { transform: translateX(-20%) scale(${scale}); }
          100% { transform: translateX(0) scale(${scale}); }
        `;
      case "top-bottom":
        return `
          0% { transform: translateY(0) scale(${scale}); }
          100% { transform: translateY(-20%) scale(${scale}); }
        `;
      case "bottom-top":
        return `
          0% { transform: translateY(-20%) scale(${scale}); }
          100% { transform: translateY(0) scale(${scale}); }
        `;
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "black",
        overflow: "hidden",
      }}
    >
      <Image
        src={imageUrl}
        width={800}
        height={450}
        alt="Parallax Pan"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          animation: `parallaxPan ${duration}s ease-out infinite alternate`,
        }}
      />
      <style jsx>{`
        @keyframes parallaxPan {
          ${getKeyframes()}
        }
      `}</style>
    </div>
  );
};

export default ParallaxPan;





// Description
// Reveals content through an expanding circular clip-path that grows from the centre outward using interpolate() on the circle radius. Creates an iris/spotlight effect commonly used in film for dramatic reveals, scene openings, or focusing attention on a key element.

// Reveal speed, final radius, and centre point are configurable. A subtle radial glow at the expanding edge adds polish. The clip-path approach means any content placed inside — text, images, charts — gets the reveal treatment automatically.

"use client";

import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export default function SpotlightReveal() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Clip-path radius grows from 0% to 75%
  const radius = interpolate(frame, [0, durationInFrames * 0.8], [0, 75], {
    extrapolateRight: "clamp",
  });

  // Glow opacity peaks mid-animation then fades
  const glowOpacity = interpolate(
    frame,
    [0, durationInFrames * 0.3, durationInFrames * 0.8],
    [0, 0.6, 0],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Revealed content behind clip */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, #111827, #1e1b4b)",
          clipPath: `circle(${radius}% at 50% 50%)`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Decorative top bar */}
        <div
          style={{
            width: "80px",
            height: "4px",
            background: "linear-gradient(90deg, #3b82f6, #a855f7)",
            borderRadius: "2px",
            marginBottom: "1.5rem",
          }}
        />
        <h1
          style={{
            color: "white",
            fontSize: "3.5rem",
            fontWeight: 400,
            margin: 0,
            letterSpacing: "0.1em",
          }}
        >
          REVEALED
        </h1>
        <p
          style={{
            color: "#c4b5fd",
            fontSize: "1.1rem",
            marginTop: "0.75rem",
          }}
        >
          Spotlight reveal transition
        </p>
        {/* Decorative bottom bar */}
        <div
          style={{
            width: "80px",
            height: "4px",
            background: "linear-gradient(90deg, #a855f7, #3b82f6)",
            borderRadius: "2px",
            marginTop: "1.5rem",
          }}
        />
      </div>

      {/* Glow at the edge of the circle */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, transparent ${radius - 2}%, rgba(139, 92, 246, ${glowOpacity}) ${radius}%, transparent ${radius + 3}%)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}


// escription
// Fades the current scene to full black, then fades the next scene in from black — the standard cinematic dip-to-black transition. Opacity is driven by interpolate() across two phases: scene A fades out in the first half, scene B fades in in the second half.

// Place this component between two Sequences to create a clean break. Transition duration and midpoint hold time are configurable. The frame-based approach ensures the transition is sample-accurate regardless of playback environment.

"use client";

import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export default function FadeThroughBlack() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = fps * 3;
  const midpoint = totalFrames / 2;

  // Scene 1 fades out in the first half
  const scene1Opacity = interpolate(frame, [0, midpoint], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scene 2 fades in during the second half
  const scene2Opacity = interpolate(frame, [midpoint, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Black overlay peaks at midpoint
  const blackOpacity = interpolate(
    frame,
    [0, midpoint * 0.7, midpoint, midpoint * 1.3, totalFrames],
    [0, 0.8, 1, 0.8, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Scene 1 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity: scene1Opacity,
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            marginBottom: "1rem",
          }}
        />
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
          }}
        >
          Scene 1
        </h2>
        <p style={{ color: "#93c5fd", fontSize: "1.1rem", marginTop: "0.5rem" }}>
          Fading out...
        </p>
      </div>

      {/* Scene 2 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity: scene2Opacity,
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #a855f7, #7c3aed)",
            marginBottom: "1rem",
          }}
        />
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
          }}
        >
          Scene 2
        </h2>
        <p style={{ color: "#c084fc", fontSize: "1.1rem", marginTop: "0.5rem" }}>
          Fading in...
        </p>
      </div>

      {/* Black overlay for the through-black transition */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#000000",
          opacity: blackOpacity,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}



// Description
// Fades a logo in while scaling it from 0.8x to 1x using spring() for a subtle, polished brand reveal. A company name or tagline fades in on a slight delay below the logo. Use as the opening or closing frame of any branded video.

// Replace the placeholder logo shape with your own SVG, image, or React component. Spring config, delay timing, and text content are configurable. The spring physics create natural motion that avoids the mechanical feel of linear fades.

/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { useCurrentFrame, spring, useVideoConfig } from "remotion";

export default function LogoFadeReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo fade + scale using spring
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  const logoOpacity = logoProgress;
  const logoScale = 0.8 + 0.2 * logoProgress;

  // Company name fades in with delay
  const textProgress = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 14, stiffness: 60, mass: 0.6 },
  });

  const textOpacity = textProgress;
  const textTranslateY = 20 * (1 - textProgress);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: "120px",
          height: "120px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #4361ee, #7209b7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          boxShadow: "0 0 40px rgba(67, 97, 238, 0.3)",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "1.8rem",
            fontWeight: 400,
            letterSpacing: "0.1em",
            fontFamily: "Inter, sans-serif",
          }}
        >
          LOGO
        </span>
      </div>

      {/* Company Name */}
      <h2
        style={{
          color: "white",
          fontSize: "2rem",
          fontWeight: 400,
          marginTop: "1.5rem",
          marginBottom: 0,
          fontFamily: "Inter, sans-serif",
          letterSpacing: "0.05em",
          opacity: textOpacity,
          transform: `translateY(${textTranslateY}px)`,
        }}
      >
        Company Name
      </h2>
      <p
        style={{
          color: "#93c5fd",
          fontSize: "1rem",
          marginTop: "0.5rem",
          fontFamily: "Inter, sans-serif",
          opacity: textOpacity,
          transform: `translateY(${textTranslateY}px)`,
        }}
      >
        Your tagline here
      </p>
    </div>
  );
}



// Description
// Springs a title from below into position using spring(), then grows a gradient underline from left to right using interpolate() on width. A subtitle fades in with a delay. A complete, self-contained intro scene ready to be placed at the start of any video Sequence.

// Title text, subtitle, underline gradient colors, and spring config are configurable. The three-phase animation (title entrance, underline grow, subtitle fade) creates a professional opening cadence without any additional composition work.

/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export default function CinematicTitleIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = spring({
    frame,
    fps,
    from: 50,
    to: 0,
    durationInFrames: 40,
    config: {
      damping: 14,
      mass: 0.8,
    },
  });

  const titleOpacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    durationInFrames: 30,
  });

  const underlineWidth = interpolate(frame, [20, 50], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #111827 0%, #1a1a2e 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1
        style={{
          color: "white",
          fontSize: "4rem",
          fontWeight: 400,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          margin: 0,
          letterSpacing: "0.05em",
        }}
      >
        Your Story Begins
      </h1>
      <div
        style={{
          width: `${underlineWidth}%`,
          maxWidth: 320,
          height: 4,
          background: "linear-gradient(90deg, #4361ee, #7209b7)",
          borderRadius: 2,
          marginTop: 16,
        }}
      />
      <p
        style={{
          color: "rgba(255, 255, 255, 0.8)",
          fontSize: "1.5rem",
          fontWeight: 300,
          opacity: subtitleOpacity,
          marginTop: 24,
          letterSpacing: "0.1em",
        }}
      >
        A Cinematic Experience
      </p>
    </div>
  );
}



// Description
// Scales up an end-of-video card using spring() with a thank-you heading, subscribe button, social media icon placeholders, and channel name. A ready-made outro scene — drop it into the final Sequence of any video for a professional sign-off that encourages engagement.

// Heading text, CTA label, social links, and channel name are configurable. An animated border glow adds visual polish. The card is self-contained and composable — it works as the last scene in any video composition.


/**
 * Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export default function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    from: 0.8,
    to: 1,
    durationInFrames: 35,
    config: {
      damping: 12,
      mass: 0.6,
    },
  });

  const contentOpacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    durationInFrames: 30,
  });

  const glowOpacity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.7]
  );

  const buttonOpacity = spring({
    frame: Math.max(0, frame - 20),
    fps,
    from: 0,
    to: 1,
    durationInFrames: 25,
  });

  const iconsOpacity = spring({
    frame: Math.max(0, frame - 30),
    fps,
    from: 0,
    to: 1,
    durationInFrames: 25,
  });

  const socialColors = ["#3b82f6", "#4361ee", "#7209b7", "#9333ea"];

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #111827 0%, #1a1a2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity: contentOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 48,
          borderRadius: 16,
          border: `2px solid rgba(67, 97, 238, ${glowOpacity})`,
          boxShadow: `0 0 40px rgba(67, 97, 238, ${glowOpacity * 0.3})`,
          background: "rgba(17, 24, 39, 0.8)",
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: "3.5rem",
            fontWeight: 400,
            margin: 0,
            letterSpacing: "0.03em",
          }}
        >
          Thanks for Watching
        </h1>
        <div
          style={{
            opacity: buttonOpacity,
            marginTop: 32,
            padding: "14px 40px",
            background: "linear-gradient(90deg, #4361ee, #7209b7)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: "1.2rem",
              fontWeight: 400,
              letterSpacing: "0.05em",
            }}
          >
            Subscribe for More
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 32,
            opacity: iconsOpacity,
          }}
        >
          {socialColors.map((color, i) => (
            <div
              key={i}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: color,
              }}
            />
          ))}
        </div>
        <p
          style={{
            color: "rgba(255, 255, 255, 0.5)",
            fontSize: "0.9rem",
            marginTop: 28,
            letterSpacing: "0.1em",
            fontWeight: 300,
          }}
        >
          STUDIO CREATIVE
        </p>
      </div>
    </div>
  );
}



// Description
// Slides two panels in from opposite sides using spring() to meet in the centre, with a gradient divider line fading in after they settle. Use for side-by-side comparisons, dual perspectives, before/after reveals, or any layout that needs two equal content areas.

// Panel content, background colors, and divider style are configurable. Each panel is an independent container, so you can nest any React content inside — text, images, charts, or other Remotion components.

"use client";

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function SplitScreen() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Left panel slides in from left
  const leftSlide = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  // Right panel slides in from right with slight delay
  const rightSlide = spring({
    frame: frame - 5,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const leftTranslateX = interpolate(leftSlide, [0, 1], [-100, 0]);
  const rightTranslateX = interpolate(rightSlide, [0, 1], [100, 0]);

  // Divider fades in after panels meet
  const dividerOpacity = interpolate(frame, [fps * 0.6, fps * 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {/* Left panel */}
      <div
        style={{
          width: "50%",
          height: "100%",
          transform: `translateX(${leftTranslateX}%)`,
          background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
          }}
        >
          Panel A
        </h2>
        <p
          style={{
            color: "#bfdbfe",
            fontSize: "1rem",
            marginTop: "0.75rem",
            textAlign: "center",
          }}
        >
          Left side content slides in from the left edge
        </p>
      </div>

      {/* Right panel */}
      <div
        style={{
          width: "50%",
          height: "100%",
          transform: `translateX(${rightTranslateX}%)`,
          background: "linear-gradient(135deg, #5b21b6, #7c3aed)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
          }}
        >
          Panel B
        </h2>
        <p
          style={{
            color: "#ddd6fe",
            fontSize: "1rem",
            marginTop: "0.75rem",
            textAlign: "center",
          }}
        >
          Right side content slides in from the right edge
        </p>
      </div>

      {/* Center divider */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          bottom: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "2px",
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.8), transparent)",
          opacity: dividerOpacity,
        }}
      />
    </div>
  );
}


// Description
// Reveals three overlapping photo frames one at a time using staggered spring() animations, each with a slight rotation offset (-5, 0, +5 degrees) for a casual stacked-photos look. Use for image galleries, portfolio highlights, or team introductions.

// Frame count, rotation angles, image content, and reveal timing are configurable. White borders and drop shadows create depth. The sequential reveal builds visual interest as each photo lands on the stack.

"use client";

import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export default function PhotoStack() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const photos = [
    { label: "Photo 1", rotation: -5, gradient: "linear-gradient(135deg, #1d4ed8, #3b82f6)", delay: 0 },
    { label: "Photo 2", rotation: 0, gradient: "linear-gradient(135deg, #7c3aed, #a855f7)", delay: 8 },
    { label: "Photo 3", rotation: 5, gradient: "linear-gradient(135deg, #059669, #34d399)", delay: 16 },
  ];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {photos.map((photo, i) => {
        const appear = spring({
          frame: frame - photo.delay,
          fps,
          config: { damping: 12, stiffness: 100 },
        });

        const scale = appear;
        const opacity = appear;
        const offsetX = (i - 1) * 30;
        const offsetY = (i - 1) * -10;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "200px",
              height: "260px",
              transform: `translate(${offsetX}px, ${offsetY}px) rotate(${photo.rotation}deg) scale(${scale})`,
              opacity,
              borderRadius: "8px",
              border: "6px solid white",
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              background: photo.gradient,
            }}
          >
            <div
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                marginBottom: "0.75rem",
              }}
            />
            <span
              style={{
                color: "white",
                fontSize: "1.2rem",
                fontWeight: 400,
              }}
            >
              {photo.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}


// Description
// Renders large numbers counting down from 5 to 1 with spring-based scale animations, followed by a 'GO' reveal. Each number scales up with spring() overshoot, holds briefly, then fades out. A self-contained countdown scene for video intros, product launches, or event teasers.

// Countdown start number, hold duration, and spring config are configurable. The frame-driven approach using Math.floor() ensures each number displays for an exact number of frames regardless of playback environment.

/** Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function CountdownTimer() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const framesPerNumber = Math.floor(fps * 0.8);
  const totalNumbers = 6; // 5, 4, 3, 2, 1, GO
  const currentIndex = Math.min(
    Math.floor(frame / framesPerNumber),
    totalNumbers - 1
  );
  const frameInSegment = frame - currentIndex * framesPerNumber;

  const numbers = ["5", "4", "3", "2", "1", "GO"];
  const currentLabel = numbers[currentIndex];

  const scale = spring({
    frame: frameInSegment,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
  });

  const opacity = interpolate(
    frameInSegment,
    [0, 5, framesPerNumber - 8, framesPerNumber],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" }
  );

  const isGo = currentIndex === totalNumbers - 1;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity: isGo ? 1 : opacity,
          fontSize: isGo ? "8rem" : "10rem",
          fontWeight: 400,
          fontFamily: "Inter, sans-serif",
          color: "white",
          background: isGo
            ? "linear-gradient(135deg, #3b82f6, #7209b7)"
            : "none",
          WebkitBackgroundClip: isGo ? "text" : undefined,
          WebkitTextFillColor: isGo ? "transparent" : undefined,
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        {currentLabel}
      </div>
    </div>
  );
}


// Description
// Pops in notification toast cards from the right using spring(), with multiple notifications stacking vertically with staggered delays. Each card includes an icon placeholder, title, body text, and a badge counter — perfect for app demos, feature walkthroughs, or social media UI mockups.

// Notification content, stack count, and spring timing are configurable. The semi-transparent card styling with borders creates a realistic notification look that composites well over any background content.

/** Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function NotificationPop() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const notifications = [
    { title: "New Message", body: "Hey! Check out this update.", color: "#3b82f6", delay: 0 },
    { title: "Task Complete", body: "Your render finished successfully.", color: "#a855f7", delay: 20 },
    { title: "New Follower", body: "Someone started following you.", color: "#4361ee", delay: 40 },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(180deg, #111827, #1f2937)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "40px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <h2
        style={{
          position: "absolute",
          top: "40px",
          left: "40px",
          color: "white",
          fontSize: "1.8rem",
          fontWeight: 400,
          fontFamily: "Inter, sans-serif",
          margin: 0,
        }}
      >
        Notifications
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          alignItems: "flex-end",
        }}
      >
        {notifications.map((notif, i) => {
          const delayedFrame = Math.max(0, frame - notif.delay);
          const slideIn = spring({
            frame: delayedFrame,
            fps,
            config: { damping: 14, stiffness: 180, mass: 0.6 },
          });

          const translateX = interpolate(slideIn, [0, 1], [300, 0]);
          const opacity = interpolate(slideIn, [0, 1], [0, 1]);

          return (
            <div
              key={i}
              style={{
                transform: `translateX(${translateX}px)`,
                opacity,
                width: "320px",
                padding: "16px",
                borderRadius: "12px",
                background: "rgba(31, 41, 55, 0.9)",
                border: `1px solid rgba(255, 255, 255, 0.1)`,
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: notif.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: "white",
                    fontSize: "0.95rem",
                    fontWeight: 400,
                    fontFamily: "Inter, sans-serif",
                    marginBottom: "4px",
                  }}
                >
                  {notif.title}
                </div>
                <div
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.8rem",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {notif.body}
                </div>
              </div>
              {i === 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "#ef4444",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "white",
                    fontSize: "0.7rem",
                    fontWeight: 400,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  3
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



// Description
// Renders a horizontal step indicator with circles connected by lines, where each step fills in sequence using interpolate() — the circle fills with color, the connecting line draws, and the active step pulses via spring(). Use for project timelines, onboarding flows, or process explanations.

// Step labels, count, and colors are configurable. The sequential animation naturally guides the viewer through each stage, making it ideal for tutorial videos, roadmap presentations, or any content showing a multi-step process.

/** Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function ProgressSteps() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = ["Research", "Design", "Build", "Launch"];
  const framesPerStep = Math.floor(fps * 0.8);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(180deg, #111827, #1f2937)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h2
        style={{
          color: "white",
          fontSize: "2rem",
          fontWeight: 400,
          marginBottom: "60px",
          margin: 0,
          marginTop: 0,
          paddingBottom: "60px",
        }}
      >
        Project Timeline
      </h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0px",
          position: "relative",
        }}
      >
        {steps.map((label, i) => {
          const stepStart = i * framesPerStep;
          const fillProgress = interpolate(
            frame,
            [stepStart, stepStart + framesPerStep * 0.6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const isActive =
            frame >= stepStart && frame < stepStart + framesPerStep;
          const isComplete = frame >= stepStart + framesPerStep * 0.6;

          const pulse = isActive
            ? spring({
                frame: frame - stepStart,
                fps,
                config: { damping: 8, stiffness: 150, mass: 0.4 },
              })
            : 1;

          const circleScale = isActive ? 0.9 + pulse * 0.2 : isComplete ? 1.1 : 1;

          const lineProgress =
            i < steps.length - 1
              ? interpolate(
                  frame,
                  [stepStart + framesPerStep * 0.5, stepStart + framesPerStep],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                )
              : 0;

          return (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "80px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    border: `3px solid ${fillProgress > 0 ? "#3b82f6" : "#4b5563"}`,
                    background:
                      fillProgress > 0
                        ? `linear-gradient(135deg, #3b82f6, #7209b7)`
                        : "transparent",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    transform: `scale(${circleScale})`,
                    transition: "border-color 0.1s",
                  }}
                >
                  <span
                    style={{
                      color: fillProgress > 0 ? "white" : "#6b7280",
                      fontSize: "1rem",
                      fontWeight: 400,
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
                <span
                  style={{
                    color: fillProgress > 0 ? "#93c5fd" : "#6b7280",
                    fontSize: "0.8rem",
                    fontWeight: 400,
                    marginTop: "10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
              </div>

              {i < steps.length - 1 && (
                <div
                  style={{
                    width: "80px",
                    height: "3px",
                    background: "#374151",
                    borderRadius: "2px",
                    position: "relative",
                    overflow: "hidden",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      width: `${lineProgress * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #3b82f6, #a855f7)",
                      borderRadius: "2px",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



// Description
// Renders a sentence where individual words get highlighted sequentially with a colored background that grows behind each word using interpolate() on width. Previously highlighted words keep their highlight, building up a fully highlighted phrase.

// Words, highlight color, and timing are configurable. Use for key message emphasis, call-to-action reveals, or educational content where specific words need to stand out. The growing highlight creates a marker-pen drawing effect.

/** Free Remotion Template Component
 * ---------------------------------
 * This template is free to use in your projects!
 * Credit appreciated but not required.
 *
 * Created by the team at https://www.reactvideoeditor.com
 *
 * Happy coding and building amazing videos! 🎉
 */

"use client";

import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

export default function TextHighlight() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = ["Build", "amazing", "videos", "with", "code"];
  const framesPerWord = Math.floor(fps * 0.6);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(180deg, #111827, #1f2937)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          maxWidth: "700px",
          padding: "40px",
        }}
      >
        {words.map((word, i) => {
          const wordStart = i * framesPerWord;
          const highlightProgress = interpolate(
            frame,
            [wordStart, wordStart + framesPerWord * 0.5],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const isHighlighted = highlightProgress > 0;

          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                fontSize: "3.5rem",
                fontWeight: 400,
                color: "white",
                padding: "4px 12px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${highlightProgress * 100}%`,
                  background: "linear-gradient(135deg, #3b82f6, #7209b7)",
                  borderRadius: "6px",
                  zIndex: 0,
                  opacity: isHighlighted ? 0.85 : 0,
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>{word}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}



// Description
// Renders a full-screen gradient that smoothly shifts colors over time using Math.sin() at different phase offsets on useCurrentFrame(). The gradient cycles through deep blues, purples, and teals for a subtle, ambient background motion.

// Color range, shift speed, and gradient angle are configurable. The slow, continuous motion adds visual life to static scenes without distracting from foreground content. Loops seamlessly for any duration.

"use client";

import { useCurrentFrame, useVideoConfig } from "remotion";

export default function GradientShift() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const t = frame / fps;

  // Slowly cycle through hue phases using sin waves
  const phase1 = Math.sin(t * 0.3) * 0.5 + 0.5;
  const phase2 = Math.sin(t * 0.3 + 2) * 0.5 + 0.5;
  const phase3 = Math.sin(t * 0.3 + 4) * 0.5 + 0.5;

  // Interpolate between deep blues, purples, teals
  const colors = [
    { r: 26, g: 26, b: 46 },   // #1a1a2e
    { r: 22, g: 33, b: 62 },   // #16213e
    { r: 15, g: 52, b: 96 },   // #0f3460
    { r: 26, g: 26, b: 46 },   // #1a1a2e
  ];

  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

  const idx1 = Math.floor(phase1 * 2);
  const frac1 = phase1 * 2 - idx1;
  const c1 = colors[idx1];
  const c1Next = colors[idx1 + 1];
  const color1 = `rgb(${lerp(c1.r, c1Next.r, frac1)}, ${lerp(c1.g, c1Next.g, frac1)}, ${lerp(c1.b, c1Next.b, frac1)})`;

  const idx2 = Math.floor(phase2 * 2);
  const frac2 = phase2 * 2 - idx2;
  const c2 = colors[idx2];
  const c2Next = colors[idx2 + 1];
  const color2 = `rgb(${lerp(c2.r, c2Next.r, frac2)}, ${lerp(c2.g, c2Next.g, frac2)}, ${lerp(c2.b, c2Next.b, frac2)})`;

  const idx3 = Math.floor(phase3 * 2);
  const frac3 = phase3 * 2 - idx3;
  const c3 = colors[idx3];
  const c3Next = colors[idx3 + 1];
  const color3 = `rgb(${lerp(c3.r, c3Next.r, frac3)}, ${lerp(c3.g, c3Next.g, frac3)}, ${lerp(c3.b, c3Next.b, frac3)})`;

  // Slowly rotate the gradient angle
  const angle = (frame * 0.5) % 360;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `linear-gradient(${angle}deg, ${color1}, ${color2}, ${color3})`,
      }}
    />
  );
}


// Description
// Renders ~80 stars as small circles that move outward from the centre of the frame, growing slightly as they approach the edges to simulate flying through space. Star positions use deterministic index-based seeding — not Math.random() — for consistent server-side rendering.

// Star count, speed, and size range are configurable. The hyperdrive starfield effect is perfect for sci-fi intros, tech content backgrounds, or any scene that needs a sense of forward motion and depth.


"use client";

import { useCurrentFrame, useVideoConfig } from "remotion";

export default function Starfield() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const cx = width / 2;
  const cy = height / 2;
  const totalStars = 80;

  // Generate stars with deterministic positions based on index
  const stars = Array.from({ length: totalStars }, (_, i) => {
    // Deterministic seed values using index
    const seedAngle = ((i * 137.508) % 360) * (Math.PI / 180);
    const seedRadius = ((i * 31 + 17) % 50) / 50; // 0 to 1
    const speed = 0.5 + ((i * 7 + 3) % 10) / 10; // 0.5 to 1.5
    const baseSize = 1 + ((i * 13 + 5) % 3);

    // Progress of this star outward (loops every ~5 seconds)
    const cycleLength = fps * 5;
    const rawProgress = ((frame * speed + i * 15) % cycleLength) / cycleLength;
    const progress = rawProgress;

    // Start near center, move outward
    const maxRadius = Math.max(cx, cy) * 1.2;
    const radius = seedRadius * 20 + progress * maxRadius;

    const x = cx + Math.cos(seedAngle) * radius;
    const y = cy + Math.sin(seedAngle) * radius;

    // Stars grow as they move outward (perspective)
    const scale = 1 + progress * 2;
    const size = baseSize * scale;

    // Fade in as they leave center, fade out at edges
    const opacity = Math.min(progress * 4, 1) * Math.max(1 - progress * 0.8, 0.2);

    return { x, y, size, opacity, key: i };
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#0a0a1a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {stars.map((star) => (
        <div
          key={star.key}
          style={{
            position: "absolute",
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
            borderRadius: "50%",
            backgroundColor: "white",
            opacity: star.opacity,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}


// Description
// Renders a grid of dots whose opacity and scale pulse outward from the centre in a ripple wave pattern. Each dot's animation is offset by its distance from centre minus the current frame, creating a smooth expanding wavefront driven by useCurrentFrame().

// Grid density, dot size, ripple speed, and color are configurable. The hypnotic ripple pattern works well as a tech background, data-themed scene, or ambient texture for presentations and product demos.

"use client";

import { useCurrentFrame, useVideoConfig } from "remotion";

export default function GridPulse() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const cols = 12;
  const rows = 8;
  const dotSize = 10;

  const spacingX = width / (cols + 1);
  const spacingY = height / (rows + 1);

  // Center of the grid
  const centerCol = (cols - 1) / 2;
  const centerRow = (rows - 1) / 2;

  const t = frame / fps;

  const dots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = spacingX * (col + 1);
      const y = spacingY * (row + 1);

      // Distance from center in grid units
      const dx = col - centerCol;
      const dy = row - centerRow;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Wave: pulse travels outward from center
      const wave = Math.sin(t * 3 - distance * 0.8);
      const normalizedWave = wave * 0.5 + 0.5; // 0 to 1

      const opacity = 0.15 + normalizedWave * 0.85;
      const scale = 0.4 + normalizedWave * 0.6;

      dots.push({ x, y, opacity, scale, key: row * cols + col });
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {dots.map((dot) => (
        <div
          key={dot.key}
          style={{
            position: "absolute",
            left: dot.x,
            top: dot.y,
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            backgroundColor: "#3b82f6",
            opacity: dot.opacity,
            transform: `translate(-50%, -50%) scale(${dot.scale})`,
          }}
        />
      ))}
    </div>
  );
}


// Description
// Black bars covering the full screen retract to cinematic letterbox proportions using interpolate(), revealing the content underneath. The bars animate from 50% coverage each down to ~12%, creating the classic film-opening effect.

// Bar retraction speed and final letterbox ratio are configurable. Use as the opening moment of any video to set a cinematic tone, or pair with title text underneath for a dramatic reveal sequence.

"use client";

import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export default function LetterboxReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barHeight = interpolate(frame, [0, fps * 2], [50, 12], {
    extrapolateRight: "clamp",
  });

  const contentOpacity = interpolate(frame, [fps * 0.5, fps * 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        overflow: "hidden",
      }}
    >
      {/* Content underneath */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity: contentOpacity,
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: "4rem",
            fontWeight: 400,
            margin: 0,
            letterSpacing: "0.3em",
            fontFamily: "Inter, sans-serif",
          }}
        >
          CINEMATIC
        </h1>
        <p
          style={{
            color: "#93c5fd",
            fontSize: "1.2rem",
            marginTop: "1rem",
            letterSpacing: "0.15em",
            fontFamily: "Inter, sans-serif",
          }}
        >
          A letterbox reveal
        </p>
      </div>

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `${barHeight}%`,
          backgroundColor: "#000000",
          zIndex: 10,
        }}
      />

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: `${barHeight}%`,
          backgroundColor: "#000000",
          zIndex: 10,
        }}
      />
    </div>
  );
}


// escription
// Translates content A quickly to the left while content B enters from the right, with horizontal stretch (scaleX) applied during the fast movement to simulate motion blur. Uses interpolate() with tight frame ranges for the snappy whip-pan effect.

// Pan speed and stretch amount are configurable. The whip pan is a high-energy transition suited for action content, fast-paced edits, or any moment that needs abrupt but stylish scene changes.

"use client";

import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export default function WhipPan() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panStart = fps * 1;
  const panEnd = fps * 1.4;

  const translateA = interpolate(frame, [panStart, panEnd], [0, -100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateB = interpolate(frame, [panStart, panEnd], [100, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Motion blur stretch effect during fast pan
  const stretchX = interpolate(
    frame,
    [panStart, (panStart + panEnd) / 2, panEnd],
    [1, 1.6, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        overflow: "hidden",
      }}
    >
      {/* Scene A - Blue */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #1e3a5f, #111827)",
          transform: `translateX(${translateA}%) scaleX(${stretchX})`,
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            marginBottom: "1rem",
          }}
        />
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
            fontFamily: "Inter, sans-serif",
          }}
        >
          Scene A
        </h2>
        <p style={{ color: "#93c5fd", fontSize: "1.1rem", marginTop: "0.5rem" }}>
          Blue content
        </p>
      </div>

      {/* Scene B - Purple */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #3b1f5e, #111827)",
          transform: `translateX(${translateB}%) scaleX(${stretchX})`,
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #a855f7, #7209b7)",
            marginBottom: "1rem",
          }}
        />
        <h2
          style={{
            color: "white",
            fontSize: "2.5rem",
            fontWeight: 400,
            margin: 0,
            fontFamily: "Inter, sans-serif",
          }}
        >
          Scene B
        </h2>
        <p style={{ color: "#c084fc", fontSize: "1.1rem", marginTop: "0.5rem" }}>
          Purple content
        </p>
      </div>
    </div>
  );
}




// Description
// A circular iris shrinks to centre on Scene A (radius 75% to 0%), then expands from centre to reveal Scene B (0% to 75%), using clipPath circle() driven by interpolate(). The classic old-film iris transition recreated with modern Remotion hooks.

// Iris speed and centre point are configurable. The two-phase close/open creates a natural scene break — ideal for cartoon-style content, retro aesthetics, comedic timing, or any video that references classic filmmaking.

"use client";

import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export default function IrisTransition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const midPoint = fps * 1.25;
  const totalFrames = fps * 2.5;

  // First half: iris closes (75% → 0%)
  // Second half: iris opens (0% → 75%)
  const radius = frame <= midPoint
    ? interpolate(frame, [0, midPoint], [75, 0], {
        extrapolateRight: "clamp",
      })
    : interpolate(frame, [midPoint, totalFrames], [0, 75], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const showSceneA = frame <= midPoint;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      {/* Scene underneath (B when closing, A already gone) */}
      {!showSceneA && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(135deg, #3b1f5e, #111827)",
            clipPath: `circle(${radius}% at 50% 50%)`,
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #a855f7, #7209b7)",
              marginBottom: "1rem",
            }}
          />
          <h2
            style={{
              color: "white",
              fontSize: "2.5rem",
              fontWeight: 400,
              margin: 0,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Scene B
          </h2>
          <p style={{ color: "#c084fc", fontSize: "1.1rem", marginTop: "0.5rem" }}>
            Iris opening...
          </p>
        </div>
      )}

      {/* Scene A with iris closing */}
      {showSceneA && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(135deg, #1e3a5f, #111827)",
            clipPath: `circle(${radius}% at 50% 50%)`,
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              marginBottom: "1rem",
            }}
          />
          <h2
            style={{
              color: "white",
              fontSize: "2.5rem",
              fontWeight: 400,
              margin: 0,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Scene A
          </h2>
          <p style={{ color: "#93c5fd", fontSize: "1.1rem", marginTop: "0.5rem" }}>
            Iris closing...
          </p>
        </div>
      )}
    </div>
  );
}



// Description
// Renders a large opening quotation mark that fades in first, followed by quote text with a fade reveal, then an attribution line that slides in from the right. Creates an elegant, editorial quote moment.

// Quote text, attribution, and styling are configurable. Use for inspirational moments, testimonial segments, expert quotes, or any video that needs a pause for a meaningful statement."use client";

import { useCurrentFrame, interpolate } from "remotion";

export default function QuoteCard() {
  const frame = useCurrentFrame();

  const quoteMarkOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const attributionOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const attributionX = interpolate(frame, [30, 45], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "4rem",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          color: "#3b82f6",
          fontSize: "6rem",
          fontWeight: 400,
          lineHeight: 1,
          opacity: quoteMarkOpacity,
          fontFamily: "Georgia, serif",
          marginBottom: "1rem",
        }}
      >
        {"\u201C"}
      </span>
      <p
        style={{
          color: "white",
          fontSize: "1.8rem",
          fontWeight: 400,
          lineHeight: 1.6,
          textAlign: "center",
          maxWidth: "700px",
          margin: 0,
          opacity: textOpacity,
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
        }}
      >
        Design is not just what it looks like. Design is how it works.
      </p>
      <p
        style={{
          color: "#9ca3af",
          fontSize: "1.1rem",
          fontWeight: 400,
          margin: 0,
          marginTop: "2rem",
          opacity: attributionOpacity,
          transform: `translateX(${attributionX}px)`,
          fontFamily: "Inter, sans-serif",
        }}
      >
        — Steve Jobs
      </p>
    </div>
  );
}




// Description
// Splits a title into top and bottom halves — the top slides down, the bottom slides up using spring(), meeting in centre. Top text is rendered in outline style (border, no fill), bottom in filled white, creating a typographic contrast.

// Top text, bottom text, and spring config are configurable. The split-and-meet animation with mixed typography creates a bold, modern intro card suited for creative content, fashion, music videos, or any brand-forward opening.

"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function TitleSplit() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const topY = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80 },
    from: -120,
    to: 0,
  });

  const bottomY = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80 },
    from: 120,
    to: 0,
  });

  const glowOpacity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.3, 0.8],
  );

  const meetProgress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        gap: "0.25rem",
      }}
    >
      <h1
        style={{
          color: "transparent",
          fontSize: "5rem",
          fontWeight: 400,
          margin: 0,
          letterSpacing: "0.15em",
          WebkitTextStroke: "2px white",
          transform: `translateY(${topY}px)`,
          fontFamily: "Inter, sans-serif",
          textShadow: meetProgress === 1
            ? `0 0 ${20 * glowOpacity}px rgba(59, 130, 246, ${glowOpacity})`
            : "none",
        }}
      >
        CREATIVE
      </h1>
      <h1
        style={{
          color: "white",
          fontSize: "5rem",
          fontWeight: 400,
          margin: 0,
          letterSpacing: "0.15em",
          transform: `translateY(${bottomY}px)`,
          fontFamily: "Inter, sans-serif",
          textShadow: meetProgress === 1
            ? `0 0 ${20 * glowOpacity}px rgba(59, 130, 246, ${glowOpacity})`
            : "none",
        }}
      >
        STUDIO
      </h1>
    </div>
  );
}



// Description
// Slides a small pill-shaped overlay card in from the bottom-right corner using spring(), containing a bell icon, 'Subscribe' text, and channel name. The bell icon pulses for attention. Styled as a YouTube-style floating reminder.

// Text, position, and animation timing are configurable. Use as a mid-video overlay to prompt engagement without interrupting the main content flow. The small, unobtrusive design composites cleanly over any scene.

"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function SubscribeReminder() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: Math.max(frame - 10, 0),
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  const translateY = interpolate(slideIn, [0, 1], [100, 0]);

  const bellPulse = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [1, 1.15],
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "#374151",
            fontSize: "1.5rem",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Your Video Content
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "24px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(8px)",
          padding: "0.6rem 1.2rem",
          borderRadius: "999px",
          transform: `translateY(${translateY}px)`,
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            backgroundColor: "#3b82f6",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transform: `scale(${bellPulse})`,
          }}
        >
          <span style={{ color: "white", fontSize: "0.8rem" }}>&#128276;</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              color: "white",
              fontSize: "0.85rem",
              fontWeight: 400,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Subscribe
          </span>
          <span
            style={{
              color: "#9ca3af",
              fontSize: "0.65rem",
              fontFamily: "Inter, sans-serif",
            }}
          >
            @CreativeStudio
          </span>
        </div>
      </div>
    </div>
  );
}


// Description
// Content starts zoomed in (scale 2) and blurred (filter: blur(10px)), then zooms out to normal (scale 1) and deblurs to sharp using interpolate(). Creates a dramatic focus-pull zoom reveal for hero images or featured content.

// Zoom range, blur intensity, and reveal speed are configurable. The combined zoom + deblur mimics a camera rack-focus, adding cinematic depth to any image or content reveal moment.

"use client";

import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

export default function ImageZoomReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const duration = fps * 2;

  const scale = interpolate(frame, [0, duration], [2, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const blur = interpolate(frame, [0, duration], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [duration * 0.6, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "80%",
          height: "70%",
          borderRadius: "12px",
          overflow: "hidden",
          border: "3px solid #1e293b",
          position: "relative",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #4361ee, #7209b7, #a855f7)",
            transform: `scale(${scale})`,
            filter: `blur(${blur}px)`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontSize: "1.8rem",
            fontWeight: 400,
            opacity: textOpacity,
            fontFamily: "Inter, sans-serif",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          Featured Image
        </span>
      </div>
    </div>
  );
}



// Description
// Renders a 2x3 grid of image placeholders that appear with staggered spring() animations — top-left first, bottom-right last. Each cell scales up from 0.8 to 1 with different gradient colors for visual variety.

// Grid dimensions, stagger timing, and cell content are configurable. Use for portfolio showcases, product line reveals, team introductions, or any content that presents multiple items in an organised grid layout.


"use client";

import { useCurrentFrame, spring, useVideoConfig } from "remotion";

export default function GalleryGrid() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cells = [
    { gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)", delay: 0 },
    { gradient: "linear-gradient(135deg, #a855f7, #7c3aed)", delay: 4 },
    { gradient: "linear-gradient(135deg, #4361ee, #3b82f6)", delay: 8 },
    { gradient: "linear-gradient(135deg, #7209b7, #a855f7)", delay: 12 },
    { gradient: "linear-gradient(135deg, #1d4ed8, #4361ee)", delay: 16 },
    { gradient: "linear-gradient(135deg, #7c3aed, #7209b7)", delay: 20 },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        padding: "2rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "1rem",
          width: "90%",
          height: "80%",
        }}
      >
        {cells.map((cell, i) => {
          const s = spring({
            frame: Math.max(frame - cell.delay, 0),
            fps,
            config: { damping: 12, stiffness: 100 },
          });

          const scale = 0.8 + s * 0.2;

          return (
            <div
              key={i}
              style={{
                background: cell.gradient,
                borderRadius: "10px",
                transform: `scale(${scale})`,
                opacity: s,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}


// Description
// Drops a single image inside a Polaroid-style white frame using spring(), landing with a slight rotation (-3 degrees). The thick white bottom border and drop shadow create an authentic instant-photo look. Caption text appears below the image area.

// Caption text, rotation angle, and frame proportions are configurable. Use for photo memories, travel moments, throwback segments, or any content that benefits from a nostalgic, physical-photo aesthetic.


"use client";

import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export default function PolaroidFrame() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dropIn = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 80 },
  });

  const translateY = interpolate(dropIn, [0, 1], [-300, 0]);
  const rotation = interpolate(dropIn, [0, 1], [8, -3]);
  const opacity = interpolate(dropIn, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "12px 12px 48px 12px",
          borderRadius: "4px",
          transform: `translateY(${translateY}px) rotate(${rotation}deg)`,
          opacity,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            width: "260px",
            height: "260px",
            background: "linear-gradient(135deg, #4361ee, #7209b7)",
            borderRadius: "2px",
          }}
        />
        <p
          style={{
            textAlign: "center",
            color: "#374151",
            fontSize: "0.95rem",
            fontWeight: 400,
            margin: 0,
            marginTop: "12px",
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
          }}
        >
          Summer 2024
        </p>
      </div>
    </div>
  );
}


// Description
// Three images slide horizontally with the centre image large and fully visible while side images are smaller and faded. Images shift position continuously using interpolate() on translateX, creating a looping carousel effect.

// Image count, slide speed, and content are configurable. Use for product showcases, portfolio scrolls, or any content that needs to cycle through multiple items with a clear centre-stage focus.


"use client";

import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

export default function ImageCarousel() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slides = [
    { label: "Mountain", gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)" },
    { label: "Ocean", gradient: "linear-gradient(135deg, #4361ee, #7209b7)" },
    { label: "Forest", gradient: "linear-gradient(135deg, #a855f7, #7c3aed)" },
  ];

  const cycleLength = fps * 2;
  const progress = (frame % (cycleLength * slides.length)) / cycleLength;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          position: "relative",
        }}
      >
        {slides.map((slide, i) => {
          const offset = i - progress;
          const translateX = offset * 280;
          const scale = interpolate(
            Math.abs(offset),
            [0, 1, 2],
            [1, 0.75, 0.55],
            { extrapolateRight: "clamp" }
          );
          const opacity = interpolate(
            Math.abs(offset),
            [0, 1, 2],
            [1, 0.5, 0.2],
            { extrapolateRight: "clamp" }
          );

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: "240px",
                height: "320px",
                background: slide.gradient,
                borderRadius: "12px",
                transform: `translateX(${translateX}px) scale(${scale})`,
                opacity,
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-end",
                padding: "1rem",
              }}
            >
              <span
                style={{
                  color: "white",
                  fontSize: "1rem",
                  fontWeight: 400,
                  fontFamily: "Inter, sans-serif",
                  textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              >
                {slide.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


Description
Renders a large main content area with a small overlay frame in the bottom-right corner that springs in using spring(). The PiP frame has a border and shadow for visual separation. Classic picture-in-picture layout.

PiP size, position, and content are configurable. Use for tutorial layouts (code + speaker), video call recordings, gameplay with facecam, or any content that needs a secondary view overlaid on the primary scene.

"use client";

import { useCurrentFrame, spring, useVideoConfig } from "remotion";

export default function PictureInPicture() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pipScale = spring({
    frame: Math.max(frame - 15, 0),
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1e293b, #111827)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "#6b7280",
            fontSize: "1.8rem",
            fontWeight: 400,
            fontFamily: "Inter, sans-serif",
          }}
        >
          Main Content
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          right: "20px",
          width: "180px",
          height: "130px",
          background: "linear-gradient(135deg, #4361ee, #3b82f6)",
          borderRadius: "10px",
          border: "2px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${pipScale})`,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "0.9rem",
            fontWeight: 400,
            fontFamily: "Inter, sans-serif",
          }}
        >
          Speaker
        </span>
      </div>
    </div>
  );
}



// Description
// Renders a before/after comparison with a vertical divider that sweeps from left to right using interpolate(). The left side shows 'Before' content (desaturated) and the right shows 'After' content (vibrant). A circular handle rides the divider line.

// Before/after content, divider speed, and styling are configurable. Use for photo editing demos, design iterations, renovation reveals, or any visual transformation that benefits from a direct side-by-side comparison.

"use client";

import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

export default function ImageComparisonSlider() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const duration = fps * 3;
  const dividerPercent = interpolate(frame, [10, duration], [5, 95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "85%",
          height: "75%",
          borderRadius: "12px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* After (full background) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #4361ee, #7209b7, #a855f7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: "1.5rem",
              fontWeight: 400,
              fontFamily: "Inter, sans-serif",
              opacity: 0.8,
            }}
          >
            After
          </span>
        </div>
        {/* Before (clipped) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(0 ${100 - dividerPercent}% 0 0)`,
            background: "linear-gradient(135deg, #1e293b, #374151, #4b5563)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "#9ca3af",
              fontSize: "1.5rem",
              fontWeight: 400,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Before
          </span>
        </div>
        {/* Divider */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${dividerPercent}%`,
            width: "3px",
            backgroundColor: "white",
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "white",
              border: "3px solid #3b82f6",
            }}
          />
        </div>
      </div>
    </div>
  );
}


// Description
// Renders a 3-column masonry layout with blocks of varying heights that appear with staggered spring() animations. Each block uses a different gradient color from the palette for visual variety. The staggered heights create a Pinterest-style organic grid.

// Block count, column count, and content are configurable. Use for portfolio galleries, mood boards, inspiration collections, or any content that presents many visual items in a dynamic, non-uniform grid.


"use client";

import { useCurrentFrame, spring, useVideoConfig } from "remotion";

export default function MasonryGallery() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const blocks = [
    { col: 0, height: "45%", gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)", delay: 0 },
    { col: 0, height: "50%", gradient: "linear-gradient(135deg, #a855f7, #7c3aed)", delay: 6 },
    { col: 1, height: "55%", gradient: "linear-gradient(135deg, #4361ee, #3b82f6)", delay: 3 },
    { col: 1, height: "40%", gradient: "linear-gradient(135deg, #7209b7, #a855f7)", delay: 9 },
    { col: 2, height: "40%", gradient: "linear-gradient(135deg, #1d4ed8, #4361ee)", delay: 5 },
    { col: 2, height: "55%", gradient: "linear-gradient(135deg, #7c3aed, #7209b7)", delay: 11 },
  ];

  const columns: typeof blocks[] = [[], [], []];
  blocks.forEach((block) => columns[block.col].push(block));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#111827",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        padding: "2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "1rem",
          width: "90%",
          height: "85%",
        }}
      >
        {columns.map((col, colIdx) => (
          <div
            key={colIdx}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {col.map((block, blockIdx) => {
              const s = spring({
                frame: Math.max(frame - block.delay, 0),
                fps,
                config: { damping: 12, stiffness: 100 },
              });
              const scale = 0.8 + s * 0.2;

              return (
                <div
                  key={blockIdx}
                  style={{
                    height: block.height,
                    background: block.gradient,
                    borderRadius: "10px",
                    transform: `scale(${scale})`,
                    opacity: s,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}



