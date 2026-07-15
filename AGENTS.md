# Custom Agent Instructions

## Code Modification Rules
- **Surgical Updates Only**: When making requested changes, do NOT alter or remove existing styles, transparent/glassmorphic tab settings, card configurations, or other unrelated components unless explicitly asked to do so. Only make the precise change requested.
- **Dynamic Background Maintenance**: Always preserve the dynamic address bar background height calculations (`bgDimensions` hook in `App.tsx` and the `fixed` position layout with `will-change-transform` background container) to prevent white gaps from showing up at the bottom of the screen on mobile devices.
