import React from 'react';
import { LiquidMeshBackground } from '../backgrounds/LiquidMeshBackground.jsx';
import { IsometricCyberGrid } from '../backgrounds/IsometricCyberGrid.jsx';
import { StudioSpotlightBokeh } from '../backgrounds/StudioSpotlightBokeh.jsx';

/**
 * Universal Dynamic Background Engine.
 * Intelligently switches between:
 * 1. Liquid Mesh (Apple Pro design for tech, modern business, startups)
 * 2. Isometric Cyber Grid (Technology, software, AI)
 * 3. Studio Spotlight Bokeh (History, finance, investigative storytelling)
 * 
 * Always features ambient blurred contextual topic imagery underneath!
 */
export const DynamicBackground = ({ 
  theme = 'business_editorial', 
  archetype = 'business_editorial', 
  palette = null,
  bgMediaUrl = null,
  accentColor = '#38bdf8' 
}) => {
  const activeBg = palette?.bg || '#050a18';
  const activePrimary = palette?.primary || '#38bdf8';
  const activeAccent = palette?.accent || accentColor;

  if (archetype === 'technology_ui' || archetype === 'tech-explainer') {
    return (
      <IsometricCyberGrid
        accentColor={activeAccent}
        bgColor={activeBg}
        bgMediaUrl={bgMediaUrl}
      />
    );
  }

  if (archetype === 'history_documentary' || archetype === 'finance_markets' || archetype === 'mystery_investigation') {
    return (
      <StudioSpotlightBokeh
        accentColor={activeAccent}
        bgColor={activeBg}
        bgMediaUrl={bgMediaUrl}
      />
    );
  }

  // Default: Apple Liquid Mesh for all modern editorial, startup, and scientific topics
  return (
    <LiquidMeshBackground
      primaryColor={activePrimary}
      accentColor={activeAccent}
      bgColor={activeBg}
      bgMediaUrl={bgMediaUrl}
    />
  );
};
