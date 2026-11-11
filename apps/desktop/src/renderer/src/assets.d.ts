// Vite's default asset-import behavior: importing an image gives back
// the built URL string. Needed for the four real logo files (piece 11)
// - nothing here is Electron/CCDJ-specific, just the standard Vite
// client types this project hadn't needed until now.
declare module "*.png" {
  const src: string;
  export default src;
}
