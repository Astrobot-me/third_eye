# Theme Plan: Dark Mode / Light Mode Toggle

## Current State Analysis

### Existing Styling System
- Uses CSS custom properties in `:root` in `src/styles/design-tokens.scss`
- All 16+ SCSS component files reference these CSS variables
- Current dark theme colors:
  - `--surface`: #060e20 (dark blue-black)
  - `--primary`: #aaffdc (cyber lime)
  - `--secondary`: #7de9ff (cyan)
  - `--on-surface`: #dee5ff (soft white)

### Architecture
- Settings dialog exists at `src/components/settings-dialog/SettingsDialog.tsx`
- CSS variables defined globally, scoped to `:root`

## Implementation Plan

### Phase 1: Theme System Setup

1. **Add Light Mode CSS Variables** (`src/styles/design-tokens.scss`)
   - Duplicate existing `:root` variables into `[data-theme="light"]` selector
   - Light mode colors: white backgrounds, dark text, preserve accent colors

2. **Create Theme Context** (`src/contexts/ThemeContext.tsx`)
   - React context for theme state management
   - `useTheme()` hook for components
   - Persist preference to localStorage

3. **Add Theme Toggle UI** (in SettingsDialog)
   - Toggle switch for Dark/Light mode
   - Use existing settings infrastructure

### Phase 2: Component Updates

4. **Update App.tsx**
   - Wrap app in ThemeProvider
   - Apply theme class/data attribute to root element

5. **Update design-tokens.scss**
   - Add `[data-theme="light"]` selector with light theme colors
   - Keep current `:root` as dark mode (no changes needed)

### Phase 3: Verification

6. **Test**
   - Toggle between dark/light modes
   - Verify all components render correctly in both themes

## Light Mode Color Palette (Draft)

```scss
[data-theme="light"] {
  // Surfaces - light backgrounds
  --surface: #f5f7fa;
  --surface-container-low: #e8ecf1;
  --surface-container: #ffffff;
  --surface-container-high: #f0f2f5;
  --surface-container-highest: #e0e4e8;
  --surface-bright: #d4d9de;

  // Text - dark for contrast
  --on-surface: #1a1f2e;
  --on-surface-variant: #4a5568;
  --on-surface-dim: #8892a2;

  // Accents remain similar
  --primary: #00c48c;
  --secondary: #0088cc;
}
```

## Files to Modify

1. `src/styles/design-tokens.scss` - Add light theme CSS variables
2. `src/contexts/ThemeContext.tsx` - Create new context
3. `src/App.tsx` - Integrate ThemeProvider
4. `src/components/settings-dialog/SettingsDialog.tsx` - Add toggle